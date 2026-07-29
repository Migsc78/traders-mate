import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTradieSession, tradieApi } from "../../api/tradie";

export default function TradieNewBookingPage() {
  const session = getTradieSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const enquiryId = params.get("enquiryId");

  const [title, setTitle] = useState("Site visit");
  const [startsLocal, setStartsLocal] = useState("");
  const [hours, setHours] = useState(2);
  const [notes, setNotes] = useState("");
  const [allowClash, setAllowClash] = useState(false);
  const [msg, setMsg] = useState("");

  const job = useQuery({
    queryKey: ["tradie-job", enquiryId],
    queryFn: () => tradieApi.job(enquiryId!),
    enabled: !!session && !!enquiryId,
  });

  const create = useMutation({
    mutationFn: () => {
      if (!startsLocal) throw new Error("Pick a start time");
      const startsAt = new Date(startsLocal);
      const endsAt = new Date(startsAt.getTime() + hours * 60 * 60 * 1000);
      return tradieApi.createAppointment({
        enquiryId: enquiryId || null,
        title: title || "Appointment",
        notes: notes || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        customerName: (job.data?.name as string) || null,
        customerPhone: (job.data?.phone as string) || null,
        address: (job.data?.postcode as string) || null,
        allowClash,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-appointments"] });
      navigate("/t/diary", { replace: true });
    },
    onError: (e: Error) => {
      const text = e.message || "Could not book";
      if (/overlap|clash/i.test(text)) {
        setAllowClash(true);
        setMsg(`${text} — tick “Allow overlap” and book again if you're sure.`);
      } else {
        setMsg(text);
      }
    },
  });

  if (!session) return null;

  return (
    <div>
      <div className="t-card form">
        {enquiryId && job.data && (
          <p className="muted-text" style={{ marginTop: 0 }}>
            Linked to {(job.data.name as string) || "customer"} · {(job.data.phone as string) || ""}
          </p>
        )}
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Starts
          <input type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} />
        </label>
        <label>
          Duration (hours)
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value) || 1)}
          />
        </label>
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="t-check">
          <input type="checkbox" checked={allowClash} onChange={(e) => setAllowClash(e.target.checked)} />
          Allow overlap if there&apos;s a clash warning
        </label>
        <button
          type="button"
          className="primary t-btn--block"
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Booking…" : "Book & confirm by SMS"}
        </button>
        {msg && <p className={/overlap|clash|Could not|Pick/i.test(msg) ? "error" : "muted-text"}>{msg}</p>}
      </div>
    </div>
  );
}
