import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { customersApi, occupancyLabel, roleLabel } from "../../../../api/customers";
import { QueryError } from "../../ui";
import { addressOf, fmtDate } from "../format";

/**
 * Sheet 2 step 7 — review before finishing.
 *
 * Nothing is created here: every step already saved as it went, which is what
 * makes the flow safe to abandon halfway. This is a read-back so the tradie can
 * spot the postcode they fat-fingered, with an Edit link on every block.
 */
export default function ReviewPage() {
  const { customerId = "" } = useParams();
  const navigate = useNavigate();

  const record = useQuery({
    queryKey: ["tradie-customer", customerId],
    queryFn: () => customersApi.get(customerId),
    enabled: !!customerId,
  });

  if (record.isLoading && !record.data) return <p className="muted-text">Loading…</p>;
  if (!record.data) {
    return (
      <div>
        <QueryError error={record.error} />
      </div>
    );
  }

  const c = record.data;
  const assets = c.properties.flatMap((p) => p.assets);

  return (
    <div>
      <section className="t-card t-review-block">
        <div className="t-review-head">
          <strong>Customer</strong>
          <Link className="linkish" to={`/t/customers/${c.id}/edit`}>
            Edit
          </Link>
        </div>
        <p className="t-review-line">{c.name}</p>
        <p className="muted-text">{[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}</p>
      </section>

      <section className="t-card t-review-block">
        <div className="t-review-head">
          <strong>Contacts ({c.contacts.length})</strong>
          <Link className="linkish" to={`/t/customers/${c.id}/contacts`}>
            Edit
          </Link>
        </div>
        {c.contacts.map((ct) => (
          <p key={ct.id} className="t-review-line">
            {ct.name}
            <span className="t-mini-pill">{roleLabel(ct.role)}</span>
            {ct.isPrimary && <span className="t-mini-pill is-shared">Primary</span>}
          </p>
        ))}
      </section>

      <section className="t-card t-review-block">
        <div className="t-review-head">
          <strong>Properties ({c.properties.length})</strong>
          <Link className="linkish" to={`/t/customers/${c.id}/properties/new`}>
            Add
          </Link>
        </div>
        {c.properties.map((p) => (
          <div key={p.id}>
            <p className="t-review-line">
              {p.nickname || "Property"}
              <span className="t-mini-pill">{occupancyLabel(p.occupancy)}</span>
            </p>
            <p className="muted-text">{addressOf(p) || "No address"}</p>
            {p.access && (
              <div className="t-flag-row" style={{ marginTop: 6 }}>
                {p.access.keySafe && <span className="t-mini-pill">Key safe</span>}
                {p.access.hasAccessCode && <span className="t-mini-pill">Code set</span>}
                {p.access.alarm && <span className="t-mini-pill">Alarm</span>}
                {p.access.dogOnSite && <span className="t-mini-pill">Dog on site</span>}
                {p.access.safetyFlags.map((f) => (
                  <span key={f} className="t-mini-pill">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {c.properties.length === 0 && <p className="muted-text">None yet.</p>}
      </section>

      <section className="t-card t-review-block">
        <div className="t-review-head">
          <strong>Assets ({assets.length})</strong>
        </div>
        {assets.map((a) => (
          <p key={a.id} className="t-review-line">
            {a.name || a.kind}
            <span className="muted-text">{a.manufacturer || a.kind}</span>
          </p>
        ))}
        {assets.length === 0 && <p className="muted-text">None yet.</p>}
      </section>

      <section className="t-card t-review-block">
        <div className="t-review-head">
          <strong>Reminders ({c.reminders.length})</strong>
          <Link className="linkish" to={`/t/customers/${c.id}/reminders`}>
            Edit
          </Link>
        </div>
        {c.reminders.map((r) => (
          <p key={r.id} className="t-review-line">
            {r.label}
            <span className="muted-text">{fmtDate(r.dueAt)}</span>
          </p>
        ))}
        {c.reminders.length === 0 && <p className="muted-text">None yet.</p>}
      </section>

      <button
        type="button"
        className="primary t-btn--block"
        onClick={() => navigate(`/t/customers/${c.id}?saved=1`, { replace: true })}
      >
        Done — open customer record
      </button>
    </div>
  );
}
