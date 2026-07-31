import { useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTradieSession, tradieApi, type AppointmentDto } from "../../api/tradie";
import { EmptyState } from "./ui";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatWeekRange(start: Date) {
  const end = new Date(start.getTime() + 6 * 86400000);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const a = start.toLocaleDateString("en-GB", opts);
  const b = end.toLocaleDateString("en-GB", opts);
  return `${a} – ${b}`;
}

function isSameWeek(a: Date, b: Date) {
  return Math.abs(startOfDay(a).getTime() - startOfDay(b).getTime()) < 12 * 3600000;
}

function mapsLinks(address: string) {
  const q = encodeURIComponent(address.trim());
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}

export default function TradieDiaryPage() {
  const session = getTradieSession();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const enquiryId = params.get("enquiryId");
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [directionsFor, setDirectionsFor] = useState<AppointmentDto | null>(null);
  const [cancelFor, setCancelFor] = useState<AppointmentDto | null>(null);

  const from = day.toISOString();
  const to = new Date(day.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const thisWeekStart = startOfDay(new Date());

  const appts = useQuery({
    queryKey: ["tradie-appointments", from, to],
    queryFn: () => tradieApi.appointments(from, to),
    enabled: !!session && !enquiryId,
  });

  const onMyWay = useMutation({
    mutationFn: (id: string) => tradieApi.appointmentOnMyWay(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-appointments"] }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => tradieApi.patchAppointment(id, { status: "CANCELLED" }),
    onSuccess: () => {
      setCancelFor(null);
      qc.invalidateQueries({ queryKey: ["tradie-appointments"] });
    },
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

  if (enquiryId) {
    return <Navigate to={`/t/diary/new?enquiryId=${encodeURIComponent(enquiryId)}`} replace />;
  }

  if (!session) return null;

  const dirLinks = directionsFor?.address ? mapsLinks(directionsFor.address) : null;

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Diary</h2>
          <p>This week&apos;s visits — reminders and on-my-way texts</p>
        </div>
        <Link className="t-add-btn" to="/t/diary/new" aria-label="New booking">
          +
        </Link>
      </header>

      <div className="t-week-bar" role="navigation" aria-label="Week">
        <button
          type="button"
          className="t-week-bar-nav"
          aria-label="Previous week"
          onClick={() => setDay(new Date(day.getTime() - 7 * 86400000))}
        >
          ‹
        </button>
        <button
          type="button"
          className="t-week-bar-label"
          onClick={() => setDay(thisWeekStart)}
          title="Jump to this week"
        >
          <strong>{formatWeekRange(day)}</strong>
          {!isSameWeek(day, thisWeekStart) && <span>Go to this week</span>}
        </button>
        <button
          type="button"
          className="t-week-bar-nav"
          aria-label="Next week"
          onClick={() => setDay(new Date(day.getTime() + 7 * 86400000))}
        >
          ›
        </button>
      </div>

      {appts.isLoading && <p className="muted-text">Loading diary…</p>}
      {appts.isError && <p className="error">{(appts.error as Error).message}</p>}

      {[...grouped.entries()].map(([dayLabel, rows]) => (
        <section key={dayLabel} className="t-diary-day">
          <p className="t-section-label">{dayLabel}</p>
          {rows.map((a) => (
            <article key={a.id} className="t-card t-diary-appt">
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
                  <button
                    type="button"
                    className="primary"
                    onClick={() => onMyWay.mutate(a.id)}
                    disabled={onMyWay.isPending}
                  >
                    On my way
                  </button>
                )}
                {a.address && (
                  <button type="button" className="t-btn" onClick={() => setDirectionsFor(a)}>
                    Directions
                  </button>
                )}
                {a.enquiryId && (
                  <Link className="t-btn" to={`/t/jobs/${a.enquiryId}`}>
                    Open job
                  </Link>
                )}
                {a.status !== "CANCELLED" && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => setCancelFor(a)}
                    disabled={cancel.isPending}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      ))}

      {/* Require real data (even stale/cached), not just "not loading" — a failed
          fetch with no cache must not read as a reassuring "no appointments". */}
      {appts.data && appts.data.length === 0 && (
        <>
          <EmptyState title="No appointments this week" hint="Tap + to book a site visit or follow-up." />
          <Link className="primary t-btn--block" to="/t/diary/new" style={{ marginTop: 12 }}>
            New booking
          </Link>
        </>
      )}

      {directionsFor && dirLinks && (
        <div
          className="t-more-root"
          role="presentation"
          onClick={() => setDirectionsFor(null)}
        >
          <div
            className="t-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Directions"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-more-handle" aria-hidden="true" />
            <p className="t-more-title">Directions</p>
            <p className="muted-text t-directions-addr">{directionsFor.address}</p>
            <div className="t-more-links">
              <a href={dirLinks.google} target="_blank" rel="noreferrer" onClick={() => setDirectionsFor(null)}>
                Google Maps
              </a>
              <a href={dirLinks.apple} target="_blank" rel="noreferrer" onClick={() => setDirectionsFor(null)}>
                Apple Maps
              </a>
              <a href={dirLinks.waze} target="_blank" rel="noreferrer" onClick={() => setDirectionsFor(null)}>
                Waze
              </a>
            </div>
            <button type="button" className="t-btn t-btn--block" style={{ marginTop: 12 }} onClick={() => setDirectionsFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {cancelFor && (
        <div
          className="t-more-root"
          role="presentation"
          onClick={() => !cancel.isPending && setCancelFor(null)}
        >
          <div
            className="t-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Cancel booking"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-more-handle" aria-hidden="true" />
            <p className="t-more-title">Cancel booking?</p>
            <p className="muted-text" style={{ margin: "0 0 4px" }}>
              {cancelFor.customerName || cancelFor.title} ·{" "}
              {new Date(cancelFor.startsAt).toLocaleString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p className="muted-text" style={{ margin: "0 0 16px" }}>
              The customer won’t get an automatic cancel SMS from this.
            </p>
            <div className="tradie-actions" style={{ flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                className="danger t-btn--block"
                onClick={() => cancel.mutate(cancelFor.id)}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? "Cancelling…" : "Yes, cancel booking"}
              </button>
              <button
                type="button"
                className="t-btn t-btn--block"
                onClick={() => setCancelFor(null)}
                disabled={cancel.isPending}
              >
                Keep booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
