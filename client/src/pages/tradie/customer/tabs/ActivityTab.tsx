import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { customersApi } from "../../../../api/customers";
import { QueryError } from "../../ui";
import { groupByDay } from "../../../../lib/dateGroups";
import { relative } from "../format";

/**
 * Screen 8 (right) — a chronological timeline.
 *
 * Built server-side from quotes, invoices, messages, appointments and jobs rather
 * than from a stored event log. See services/customers/record.ts for why: an
 * events table would need writing to from a dozen call sites and would be wrong
 * the first time one was missed, which is worse than useless in a history.
 */
export default function ActivityTab({ customerId }: { customerId: string }) {
  const activity = useQuery({
    queryKey: ["tradie-customer-activity", customerId],
    queryFn: () => customersApi.activity(customerId),
  });

  const groups = groupByDay(activity.data || [], (a) => a.at);

  return (
    <div>
      {activity.isLoading && <p className="muted-text">Loading activity…</p>}
      <QueryError error={activity.error} />

      {groups.map((g) => (
        <section key={g.key} className="t-day-group">
          <h3 className="t-day-head">{g.label}</h3>
          <ul className="t-timeline">
            {g.rows.map((a) => {
              const body = (
                <>
                  <span className={`t-dot t-dot--${a.tone}`} aria-hidden="true" />
                  <div className="t-timeline-body">
                    <strong>{a.title}</strong>
                    {a.detail && <span className="t-row-sub">{a.detail}</span>}
                    <span className="muted-text">{relative(a.at)}</span>
                  </div>
                </>
              );
              return (
                <li key={a.id} className="t-timeline-item">
                  {a.href ? (
                    <Link className="t-timeline-link" to={a.href}>
                      {body}
                    </Link>
                  ) : (
                    <div className="t-timeline-link">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!activity.isLoading && (activity.data || []).length === 0 && (
        <p className="muted-text">Nothing has happened on this customer yet.</p>
      )}
    </div>
  );
}
