import { Link } from "react-router-dom";
import { formatGbp } from "../../../../api/tradie";
import type { CustomerRecord } from "../../../../api/customers";
import { IconChevron } from "../../ui";
import { fmtDate, fmtWhen } from "../format";

/**
 * Screen 1 — "a fast snapshot of key info, actions, and what needs attention".
 *
 * Everything here is either a number the tradie is chasing or a fact they need
 * before they set off. Nothing that needs scrolling to understand.
 */
export default function OverviewTab({ record }: { record: CustomerRecord }) {
  const s = record.summary;
  const pinned = record.customerNotes.filter((n) => n.pinned);
  const nextReminder = record.reminders[0] ?? null;

  return (
    <div>
      {pinned.length > 0 && (
        <section className="t-card t-note-card">
          <strong>Important notes</strong>
          {pinned.map((n) => (
            <p key={n.id} className="t-note-body">
              {n.body}
            </p>
          ))}
        </section>
      )}

      {s.nextAppointment && (
        <Link className="t-card t-next-card" to="/t/diary">
          <div>
            <strong>Next appointment</strong>
            <p className="muted-text">{fmtWhen(s.nextAppointment.startsAt)}</p>
            <p className="t-next-title">{s.nextAppointment.title}</p>
          </div>
          <IconChevron />
        </Link>
      )}

      {!s.nextAppointment && nextReminder && (
        <Link className="t-card t-next-card" to="/t/diary">
          <div>
            <strong>Next due</strong>
            <p className="muted-text">{fmtDate(nextReminder.dueAt)}</p>
            <p className="t-next-title">{nextReminder.label}</p>
          </div>
          <IconChevron />
        </Link>
      )}

      <div className="t-stat-row">
        <div className="t-stat">
          <span className="muted-text">Open jobs</span>
          <strong>{s.openJobs}</strong>
          <span className="t-stat-sub">{formatGbp(s.openJobValuePence)}</span>
        </div>
        <div className="t-stat">
          <span className="muted-text">Outstanding invoices</span>
          <strong>{s.outstandingCount}</strong>
          <span className={`t-stat-sub${s.overdueCount ? " is-alert" : ""}`}>
            {formatGbp(s.outstandingPence)}
          </span>
        </div>
        <div className="t-stat">
          <span className="muted-text">Draft quotes</span>
          <strong>{s.draftQuotes}</strong>
          <span className="t-stat-sub">{formatGbp(s.draftQuoteValuePence)}</span>
        </div>
      </div>

      {record.tags.length > 0 && (
        <div className="t-flag-row" style={{ marginBottom: 14 }}>
          {record.tags.map((t) => (
            <span key={t} className="t-pill t-pill--slate">
              {t}
            </span>
          ))}
        </div>
      )}

      <section className="t-card">
        <h3 className="t-section-label" style={{ marginTop: 0 }}>
          Details
        </h3>
        <dl className="t-kv">
          <div>
            <dt>Type</dt>
            <dd>{record.type === "COMPANY" ? "Company" : "Individual"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{record.email || "—"}</dd>
          </div>
          <div>
            <dt>Prefers</dt>
            <dd>{record.preferredChannel.toLowerCase()}</dd>
          </div>
          <div>
            <dt>Payment terms</dt>
            <dd>{record.paymentTerms || "—"}</dd>
          </div>
          <div>
            <dt>Billing address</dt>
            <dd>{[record.billingAddress, record.billingPostcode].filter(Boolean).join(", ") || "—"}</dd>
          </div>
        </dl>
        <Link className="t-btn t-btn--block" to={`/t/customers/${record.id}/edit`} style={{ marginTop: 12 }}>
          Edit customer
        </Link>
      </section>
    </div>
  );
}
