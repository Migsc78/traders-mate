import { Link } from "react-router-dom";
import type { JobDetail, JobVisit } from "../../../../api/jobs";
import { IconChevron } from "../../ui";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Scheduled",
  CONFIRMED: "Confirmed",
  ON_THE_WAY: "On the way",
  DONE: "Done",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
};

function tone(status: string): string {
  if (status === "DONE") return "t-pill--green";
  if (status === "ON_THE_WAY") return "t-pill--green";
  if (status === "CANCELLED" || status === "NO_SHOW") return "t-pill--grey";
  return "t-pill--blue";
}

function whenLine(v: JobVisit): string {
  const s = new Date(v.arrivalWindowStart || v.startsAt);
  const e = new Date(v.arrivalWindowEnd || v.endsAt);
  const day = s.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const from = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const to = e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${from}–${to}`;
}

/**
 * Visits, which are the same records as the diary entries.
 *
 * A standard job has exactly one and this tab is a formality. It earns its place
 * on the survey-then-return-with-the-part jobs, where "when am I next there" has
 * more than one answer.
 */
export default function VisitsTab({ detail }: { detail: JobDetail }) {
  const visits = detail.job.visits;

  return (
    <section>
      {visits.length === 0 && (
        <p className="muted-text">
          Nothing booked yet. Scheduling the job puts it in your diary at the same time.
        </p>
      )}

      <ul className="t-list">
        {visits.map((v) => (
          <li key={v.id}>
            <div className="t-card t-visit-card">
              <div className="t-visit-main">
                <div className="t-row-top">
                  <strong>{whenLine(v)}</strong>
                  <span className={`t-pill ${tone(v.status)}`}>{STATUS_LABEL[v.status] || v.status}</span>
                </div>
                {v.kind && <span className="t-row-sub">{v.kind}</span>}
                {v.arrivalWindowStart && (
                  <span className="t-row-sub">Customer was given an arrival window</span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Link className="t-btn t-btn--block" to={`/t/jobs/${detail.id}/schedule`}>
        {visits.length === 0 ? "Schedule the job" : "+ Add another visit"}
      </Link>

      <Link className="t-card t-next-card" to="/t/diary" style={{ marginTop: 12 }}>
        <div>
          <strong>Open diary</strong>
          <span className="muted-text">Visits appear here and in your diary — same entry</span>
        </div>
        <IconChevron />
      </Link>
    </section>
  );
}
