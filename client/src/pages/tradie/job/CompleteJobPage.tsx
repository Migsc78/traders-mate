import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue } from "../../../api/tradie";
import { jobsApi } from "../../../api/jobs";
import { NeedsSignal, QueryError } from "../ui";
import { useOffline } from "../../../lib/connectivity";

/**
 * Signing a job off.
 *
 * The checks are prompts, not gates. A tradie standing in a customer's hallway
 * at half five is not going to be told he may not finish his own job because a
 * box is unticked — and a flow that blocks him is one he'll route around by
 * never opening it. What it does do is ask the questions that are expensive to
 * forget: is anything still owed, is there a return visit, what did you do.
 */
export default function CompleteJobPage() {
  const { enquiryId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();

  const detail = useQuery({
    queryKey: ["tradie-job", enquiryId],
    queryFn: () => jobsApi.detail(enquiryId),
    enabled: !!enquiryId,
  });

  const [workDone, setWorkDone] = useState(false);
  const [costsChecked, setCostsChecked] = useState(false);
  const [note, setNote] = useState("");
  const [returnNeeded, setReturnNeeded] = useState(false);

  const job = detail.data?.job;
  const profit = job?.profit;
  const unpriced = profit?.missingCostCount ?? 0;

  const complete = useMutation({
    mutationFn: () =>
      sendOrQueue({
        label: `Complete · ${job?.title ?? "job"}`,
        path: `/jobs/${enquiryId}/complete`,
        method: "POST",
        body: { note: note.trim() || null },
        invalidates: ["tradie-job", "tradie-jobs", "tradie-appointments"],
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-job", enquiryId] });
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      if (returnNeeded) {
        navigate(`/t/jobs/${enquiryId}/schedule`, { replace: true });
        return;
      }
      navigate(`/t/jobs/${enquiryId}/invoice`, { replace: true });
    },
  });

  if (!job) return <p className="muted-text">Loading…</p>;

  return (
    <div className="t-customer-form">
      <header className="t-page-head">
        <h2>Complete job</h2>
        <p>{job.title}</p>
      </header>

      <label className="t-toggle-row">
        <span>
          <strong>Work finished</strong>
          <span className="muted-text">Everything you were there to do</span>
        </span>
        <input type="checkbox" role="switch" checked={workDone} onChange={(e) => setWorkDone(e.target.checked)} />
      </label>

      <label className="t-toggle-row">
        <span>
          <strong>Materials and time recorded</strong>
          <span className="muted-text">
            {unpriced > 0
              ? `${unpriced} line${unpriced === 1 ? "" : "s"} still have no cost`
              : "Costs tab is up to date"}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={costsChecked}
          onChange={(e) => setCostsChecked(e.target.checked)}
        />
      </label>

      <label className="t-field">
        What you did
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Swapped the diverter valve, tested hot water on both outlets, left the old part with the customer…"
        />
        <span className="t-field-hint">
          Saved against the job. This is what you&apos;ll be glad of if they ring in six months.
        </span>
      </label>

      <label className="t-toggle-row">
        <span>
          <strong>Return visit needed</strong>
          <span className="muted-text">Waiting on a part, or a second fix</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={returnNeeded}
          onChange={(e) => setReturnNeeded(e.target.checked)}
        />
      </label>

      {profit && (
        <div className="t-card t-profit" style={{ marginTop: 4 }}>
          <dl className="t-kv">
            <div>
              <dt>Charging</dt>
              <dd>{formatGbp(profit.revenuePence)}</dd>
            </div>
            {job.depositPaidPence > 0 && (
              <div>
                <dt>Deposit already paid</dt>
                <dd>−{formatGbp(job.depositPaidPence)}</dd>
              </div>
            )}
            <div>
              <dt>{profit.provisional ? "Profit — at most" : "Job profit"}</dt>
              <dd>{formatGbp(profit.profitPence)}</dd>
            </div>
          </dl>
        </div>
      )}

      <QueryError error={complete.error} />
      {offline && <NeedsSignal>Saved on your phone and synced when you&apos;re back in range.</NeedsSignal>}

      <button
        type="button"
        className="primary t-btn--block"
        disabled={complete.isPending}
        onClick={() => complete.mutate()}
      >
        {complete.isPending ? "Saving…" : "Mark complete"}
      </button>
      <p className="t-cta-hint">
        {returnNeeded
          ? "You'll be taken straight to booking the return visit."
          : "This moves the job to To invoice so you don't forget to bill it."}
      </p>

      {!workDone && (
        <p className="t-cta-hint">
          {/* A nudge, not a lock. */}
          Nothing here is compulsory — tick what's true and carry on.
        </p>
      )}
      {costsChecked && unpriced > 0 && (
        <p className="t-cta-hint">
          You&apos;ve ticked costs as recorded but {unpriced} line{unpriced === 1 ? " has" : "s have"} no
          cost, so the profit shown is a ceiling.
        </p>
      )}
    </div>
  );
}
