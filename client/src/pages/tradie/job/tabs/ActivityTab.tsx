import { useQuery } from "@tanstack/react-query";
import { jobsApi, type JobEvent } from "../../../../api/jobs";
import { QueryError } from "../../ui";
import { groupByDay } from "../../../../lib/dateGroups";

/**
 * What happened on this job, in the order it happened.
 *
 * Recorded as it goes rather than worked out afterwards. The customer timeline
 * is derived and that's right for customers, but job history is commercial: when
 * you arrived, when they approved the extra, when it was signed off. A record
 * that quietly changes because someone edited a cost line six weeks later is
 * worse than none if a job is ever disputed.
 *
 * Nothing here is editable, deliberately. That's what makes it worth reading.
 */
const TONE: Record<string, string> = {
  "job.created": "",
  "job.scheduled": "",
  "job.rescheduled": "warn",
  "visit.on_my_way": "",
  "job.started": "",
  "job.completed": "good",
  "job.cancelled": "alert",
  "cost.added": "",
  "cost.extra_agreed": "warn",
  "invoice.created": "",
  "invoice.sent": "",
  "invoice.paid": "good",
  "access.revealed": "alert",
};

const ICON: Record<string, string> = {
  "job.created": "📋",
  "job.scheduled": "📅",
  "job.rescheduled": "📅",
  "visit.on_my_way": "🚐",
  "job.started": "🔧",
  "job.completed": "✅",
  "job.cancelled": "✖",
  "cost.added": "🧾",
  "cost.extra_agreed": "➕",
  "invoice.created": "📄",
  "invoice.sent": "📤",
  "invoice.paid": "💷",
  "access.revealed": "🔢",
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function ActivityTab({ jobId }: { jobId: string }) {
  const events = useQuery({
    queryKey: ["tradie-job-events", jobId],
    queryFn: () => jobsApi.events(jobId),
    enabled: !!jobId,
  });

  const groups = groupByDay(events.data || [], (e: JobEvent) => e.createdAt);

  return (
    <section>
      <QueryError error={events.error} />
      {events.isLoading && !events.data && <p className="muted-text">Loading…</p>}

      {groups.map((group) => (
        <section key={group.key} className="t-day-group">
          <h3 className="t-day-head">{group.label}</h3>
          <ul className="t-timeline">
            {group.rows.map((e) => (
              <li key={e.id} className="t-timeline-item">
                <div className="t-event-row">
                  <span className={`t-dot${TONE[e.type] ? ` t-dot--${TONE[e.type]}` : ""}`} />
                  <div className="t-timeline-body">
                    <strong>
                      {ICON[e.type] || "•"} {e.summary}
                    </strong>
                    <span className="muted-text">{timeOf(e.createdAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!events.isLoading && (events.data?.length ?? 0) === 0 && (
        <p className="muted-text">Nothing recorded on this job yet.</p>
      )}

      {(events.data?.length ?? 0) > 0 && (
        <p className="t-cta-hint">
          Recorded automatically. Nothing here can be edited — that&apos;s the point of it.
        </p>
      )}
    </section>
  );
}
