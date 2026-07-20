import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTradieSession, tradieApi, type AppointmentDto } from "../../api/tradie";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function TradieDiaryPage() {
  const session = getTradieSession();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const enquiryId = params.get("enquiryId");
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [title, setTitle] = useState("Site visit");
  const [startsLocal, setStartsLocal] = useState("");
  const [hours, setHours] = useState(2);
  const [notes, setNotes] = useState("");
  const [allowClash, setAllowClash] = useState(false);
  const [msg, setMsg] = useState("");

  const from = day.toISOString();
  const to = new Date(day.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const appts = useQuery({
    queryKey: ["tradie-appointments", from, to],
    queryFn: () => tradieApi.appointments(from, to),
    enabled: !!session,
  });

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
      setMsg("Booked — confirmation SMS sent if phone known.");
      setAllowClash(false);
      qc.invalidateQueries({ queryKey: ["tradie-appointments"] });
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

  const onMyWay = useMutation({
    mutationFn: (id: string) => tradieApi.appointmentOnMyWay(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-appointments"] }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => tradieApi.patchAppointment(id, { status: "CANCELLED" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-appointments"] }),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, AppointmentDto[]>();
    for (const a of appts.data || []) {
      const key = new Date(a.startsAt).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [appts.data]);

  if (!session) return null;

  return (
    <div>
      <header className="t-page-head">
        <h2>Diary</h2>
        <p>Book jobs, avoid clashes, send reminders and on-my-way texts.</p>
      </header>

      <div className="t-card form">
        <div className="tradie-actions">
          <button type="button" onClick={() => setDay(new Date(day.getTime() - 7 * 86400000))}>
            ← Prev week
          </button>
          <button type="button" onClick={() => setDay(startOfDay(new Date()))}>
            This week
          </button>
          <button type="button" onClick={() => setDay(new Date(day.getTime() + 7 * 86400000))}>
            Next week →
          </button>
        </div>
      </div>

      <div className="t-card form" style={{ marginTop: 12 }}>
        <p className="t-section-label" style={{ marginTop: 0 }}>
          New booking{enquiryId ? " (from job)" : ""}
        </p>
        {enquiryId && job.data && (
          <p className="muted-text">
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
          <input type="number" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value) || 1)} />
        </label>
        <label>
          Notes
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="t-check">
          <input type="checkbox" checked={allowClash} onChange={(e) => setAllowClash(e.target.checked)} />
          Allow overlap if there's a clash warning
        </label>
        <button type="button" className="primary t-btn--block" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? "Booking…" : "Book & confirm by SMS"}
        </button>
        {msg && <p className="muted-text">{msg}</p>}
      </div>

      {appts.isLoading && <p className="muted-text">Loading diary…</p>}
      {[...grouped.entries()].map(([dayLabel, rows]) => (
        <section key={dayLabel} style={{ marginTop: 16 }}>
          <p className="t-section-label">{dayLabel}</p>
          {rows.map((a) => (
            <article key={a.id} className="t-card" style={{ marginBottom: 10 }}>
              <strong>
                {new Date(a.startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}–
                {new Date(a.endsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · {a.title}
              </strong>
              <p className="muted-text">
                {a.customerName || "Customer"}
                {a.customerPhone ? ` · ${a.customerPhone}` : ""}
                {a.address ? ` · ${a.address}` : ""} · {a.status}
              </p>
              <div className="tradie-actions">
                {a.status !== "CANCELLED" && a.status !== "DONE" && (
                  <button type="button" className="primary" onClick={() => onMyWay.mutate(a.id)} disabled={onMyWay.isPending}>
                    On my way
                  </button>
                )}
                {a.enquiryId && (
                  <Link to={`/t/jobs/${a.enquiryId}`}>Open job</Link>
                )}
                {a.status !== "CANCELLED" && (
                  <button type="button" className="danger" onClick={() => cancel.mutate(a.id)}>
                    Cancel
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      ))}
      {!appts.isLoading && (appts.data || []).length === 0 && (
        <p className="muted-text">No appointments this week.</p>
      )}
    </div>
  );
}
