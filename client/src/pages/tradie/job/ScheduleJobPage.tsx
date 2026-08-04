import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sendOrQueue } from "../../../api/tradie";
import { jobsApi } from "../../../api/jobs";
import { NeedsSignal, QueryError } from "../ui";
import { useOffline } from "../../../lib/connectivity";

const VISIT_KINDS = ["Install", "Service", "Survey", "First fix", "Second fix", "Return with part", "Final"];

/** Local datetime for `<input type="datetime-local">`, which wants no timezone. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Book the job in.
 *
 * The arrival window is what the customer was told; the slot is what the tradie
 * blocked out. They're usually the same and the window is prefilled to match, so
 * the common case is two taps — but a "between 9 and 11" promise that quietly
 * became "at 9" is how a tradie ends up on the phone apologising.
 */
export default function ScheduleJobPage() {
  const { enquiryId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();

  const detail = useQuery({
    queryKey: ["tradie-job", enquiryId],
    queryFn: () => jobsApi.detail(enquiryId),
    enabled: !!enquiryId,
  });

  const first = defaultStart();
  const [startsAt, setStartsAt] = useState(toLocalInput(first));
  const [hours, setHours] = useState(2);
  const [kind, setKind] = useState("");
  const [notes, setNotes] = useState("");
  const [windowHours, setWindowHours] = useState(2);

  const isFirstVisit = (detail.data?.job.visits.length ?? 0) === 0;

  const save = useMutation({
    mutationFn: () => {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
      const windowEnd = new Date(start.getTime() + windowHours * 60 * 60 * 1000);
      return sendOrQueue({
        label: `Schedule · ${detail.data?.job.title ?? "job"}`,
        // The first visit also moves the job to Scheduled; later ones are just
        // another attendance, so they don't touch the job's state.
        path: isFirstVisit ? `/jobs/${enquiryId}/schedule` : `/jobs/${enquiryId}/visits`,
        method: "POST",
        body: {
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          arrivalWindowStart: start.toISOString(),
          arrivalWindowEnd: windowEnd.toISOString(),
          kind: kind || null,
          notes: notes.trim() || null,
        },
        invalidates: ["tradie-job", "tradie-jobs", "tradie-appointments"],
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      void qc.invalidateQueries({ queryKey: ["tradie-appointments"] });
      navigate(`/t/jobs/${enquiryId}?tab=visits`, { replace: true });
    },
  });

  return (
    <div className="t-customer-form">
      <header className="t-page-head">
        <h2>{isFirstVisit ? "Schedule job" : "Add a visit"}</h2>
        <p>{detail.data?.job.title}</p>
      </header>

      <label className="t-field">
        Date &amp; time
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </label>

      <div className="t-two-fields">
        <label>
          How long (hours)
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {[1, 2, 3, 4, 6, 8].map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label>
          Arrival window (hours)
          <select value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))}>
            {[1, 2, 3, 4].map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="t-field">
        Visit type
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Not set</option>
          {VISIT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <label className="t-field">
        Notes for the visit
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Collect keys from number 42…"
        />
      </label>

      <QueryError error={save.error} />
      {offline && <NeedsSignal>Saved on your phone and booked in when you&apos;re back in range.</NeedsSignal>}

      <button
        type="button"
        className="primary t-btn--block"
        disabled={save.isPending || !startsAt}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : isFirstVisit ? "Schedule job" : "Add visit"}
      </button>
      <p className="t-cta-hint">This goes in your diary at the same time.</p>
    </div>
  );
}
