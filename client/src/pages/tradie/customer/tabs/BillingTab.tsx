import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { customersApi } from "../../../../api/customers";
import { formatGbp } from "../../../../api/tradie";
import { IconChevron, QueryError, StatusPill } from "../../ui";
import { fmtDate } from "../format";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "unpaid", label: "Unpaid" },
  { id: "paid", label: "Paid" },
] as const;

/**
 * Screen 7 — "clear billing status, overdue alerts, and quick actions to chase".
 *
 * Overdue is computed from the due date rather than read off the stored status,
 * because a status set last night doesn't know that a due date passed at
 * midnight — and a chase list that's a day stale is a chase list nobody trusts.
 */
export default function BillingTab({ customerId }: { customerId: string }) {
  const [filter, setFilter] = useState<string>("all");
  const billing = useQuery({
    queryKey: ["tradie-customer-billing", customerId],
    queryFn: () => customersApi.billing(customerId),
  });

  const all = billing.data?.invoices || [];
  const totals = billing.data?.totals;

  const counts: Record<string, number> = {
    all: all.length,
    overdue: all.filter((i) => i.overdue).length,
    unpaid: all.filter((i) => !i.paidAt && !i.overdue).length,
    paid: all.filter((i) => i.paidAt).length,
  };

  const rows =
    filter === "all"
      ? all
      : filter === "overdue"
        ? all.filter((i) => i.overdue)
        : filter === "unpaid"
          ? all.filter((i) => !i.paidAt && !i.overdue)
          : all.filter((i) => i.paidAt);

  return (
    <div>
      {billing.isLoading && <p className="muted-text">Loading billing…</p>}
      <QueryError error={billing.error} />

      {totals && (
        <section className="t-card t-billing-head">
          <div>
            <span className="muted-text">Total outstanding</span>
            <strong className="t-money t-billing-total">{formatGbp(totals.outstandingPence)}</strong>
            {totals.overdueCount > 0 && (
              <span className="t-billing-alert">
                {totals.overdueCount} overdue invoice{totals.overdueCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="t-billing-actions">
            <Link className="t-btn" to="/t/invoices">
              Send reminder
            </Link>
            <Link className="primary" to="/t/invoices">
              Take payment
            </Link>
          </div>
        </section>
      )}

      <div className="t-chip-row">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`t-chip${f.id === filter ? " is-active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label} ({counts[f.id]})
          </button>
        ))}
      </div>

      <ul className="t-list">
        {rows.map((i) => (
          <li key={i.id}>
            <Link className="t-row" to={i.enquiryId ? `/t/jobs/${i.enquiryId}` : "/t/invoices"}>
              <div className="t-row-main">
                <div className="t-row-top">
                  <strong>{i.reference || "Invoice"}</strong>
                  <StatusPill status={i.overdue ? "OVERDUE" : i.paidAt ? "PAID" : i.status} />
                </div>
                <span className="t-row-sub">
                  {fmtDate(i.createdAt)}
                  {i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ""}
                </span>
              </div>
              <div className="t-row-side">
                <span className="t-money">{formatGbp(i.amountDuePence || i.totalPence)}</span>
                <IconChevron />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {!billing.isLoading && rows.length === 0 && (
        <p className="muted-text">{all.length === 0 ? "No invoices yet." : "Nothing under that filter."}</p>
      )}
    </div>
  );
}
