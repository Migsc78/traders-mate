import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatGbp, tradieApi } from "../../../../api/tradie";
import type { JobDetail } from "../../../../api/jobs";
import { IconChevron, IconPhone } from "../../ui";
import { briefingApi, warningChips } from "../briefing";

/** "Thu 6 Aug · 09:00–11:00" */
function whenLine(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = s.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const from = s.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const to = e.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${from}–${to}`;
}

/**
 * What the tradie needs before they set off, in the order they need it.
 *
 * Warnings sit above ordinary metadata deliberately: a dog on site or a key safe
 * is the difference between a wasted trip and a done job, and it is no use
 * underneath the financial summary.
 */
export default function OverviewTab({ detail }: { detail: JobDetail }) {
  const job = detail.job;
  const visit = job.nextVisit || job.visits[0] || null;

  const briefing = useQuery({
    queryKey: ["tradie-job-briefing", detail.id],
    queryFn: () => briefingApi.get(detail.id),
    enabled: !!detail.id,
  });

  const messages = useQuery({
    queryKey: ["tradie-messages", detail.id],
    queryFn: () => tradieApi.jobMessages(detail.id),
    enabled: !!detail.id,
  });

  const chips = warningChips(briefing.data);
  const latest = (messages.data || []).slice(-1)[0];
  const balance = job.quotedTotalPence - job.depositPaidPence;

  return (
    <section>
      {chips.length > 0 && (
        <div className="t-warn-row">
          {chips.map((c) => (
            <span key={c.label} className={`t-warn t-warn--${c.tone}`}>
              {c.icon} {c.label}
            </span>
          ))}
        </div>
      )}

      {visit ? (
        <Link className="t-card t-next-card" to={`/t/jobs/${detail.id}?tab=visits`}>
          <div>
            <span className="muted-text">Next visit</span>
            <strong>{whenLine(visit.arrivalWindowStart || visit.startsAt, visit.arrivalWindowEnd || visit.endsAt)}</strong>
            {visit.arrivalWindowStart && (
              <span className="muted-text">Arrival window given to the customer</span>
            )}
          </div>
          <IconChevron />
        </Link>
      ) : (
        <div className="t-card">
          <strong>Not scheduled yet</strong>
          <p className="muted-text" style={{ margin: "4px 0 0" }}>
            Nothing in the diary for this job.
          </p>
        </div>
      )}

      <Link className="t-card t-next-card" to={`/t/jobs/${detail.id}/briefing`}>
        <div>
          <strong>Before you arrive</strong>
          <span className="muted-text">Access, key safe, parking, pets and safety</span>
        </div>
        <IconChevron />
      </Link>

      {job.scope && (
        <section className="t-card t-note-card">
          <strong>Scope</strong>
          <p className="t-note-body">{job.scope}</p>
        </section>
      )}

      <p className="t-section-label">Customer &amp; property</p>
      <div className="t-card">
        <dl className="t-kv">
          <div>
            <dt>Customer</dt>
            <dd>
              {job.customer ? (
                <Link className="linkish" to={`/t/customers/${job.customer.id}`}>
                  {job.customer.name}
                </Link>
              ) : (
                detail.name
              )}
            </dd>
          </div>
          <div>
            <dt>Property</dt>
            <dd>
              {job.property ? (
                <Link className="linkish" to={`/t/properties/${job.property.id}`}>
                  {job.property.nickname || job.property.postcode || "Property"}
                </Link>
              ) : (
                detail.postcode || "—"
              )}
            </dd>
          </div>
          {detail.phone && (
            <div>
              <dt>Phone</dt>
              <dd>
                <a className="t-tel" href={`tel:${detail.phone}`}>
                  <IconPhone /> {detail.phone}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>

      <p className="t-section-label">Money</p>
      <div className="t-card">
        <dl className="t-kv">
          <div>
            <dt>Quoted (ex VAT)</dt>
            <dd>{job.quotedTotalPence > 0 ? formatGbp(job.quotedTotalPence) : "Not quoted"}</dd>
          </div>
          {job.depositPaidPence > 0 && (
            <>
              <div>
                <dt>Deposit paid</dt>
                <dd>−{formatGbp(job.depositPaidPence)}</dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>{formatGbp(balance)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Billing</dt>
            <dd>{job.commercialLabel}</dd>
          </div>
        </dl>
      </div>

      {latest && (
        <>
          <p className="t-section-label">Latest message</p>
          <Link className="t-card t-next-card" to={`/t/jobs/${detail.id}?tab=messages`}>
            <div>
              <span className="muted-text">
                {latest.direction === "INBOUND" ? "Customer" : "You"} ·{" "}
                {new Date(latest.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
              {/* One line only. The thread has its own tab; Overview is not it. */}
              <strong className="t-one-line">{latest.body}</strong>
            </div>
            <IconChevron />
          </Link>
        </>
      )}
    </section>
  );
}
