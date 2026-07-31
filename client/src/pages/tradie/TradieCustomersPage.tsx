import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, tradieApi } from "../../api/tradie";
import { EmptyState, QueryError, IconChevron, StatusPill, initialsOf } from "./ui";

function phoneKeyOf(phone: string, fallback?: string) {
  return fallback || phone.replace(/\D/g, "").slice(-10) || phone;
}

export default function TradieCustomersPage() {
  const customers = useQuery({ queryKey: ["tradie-customers"], queryFn: () => tradieApi.customers() });

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Customers</h2>
          <p>Your book — from missed calls or contacts you add</p>
        </div>
        <Link className="t-add-btn" to="/t/customers/new" aria-label="Add customer">
          +
        </Link>
      </header>

      {customers.isLoading && <p className="muted-text">Loading…</p>}
      <QueryError error={customers.error} />

      <ul className="t-list">
        {(customers.data || []).map(
          (c: {
            phone: string;
            phoneKey?: string;
            name: string;
            jobCount: number;
            lastEnquiryId: string | null;
            latestQuote: { id: string; status: string; totalPence: number } | null;
          }) => {
          const key = phoneKeyOf(c.phone, c.phoneKey);
          return (
            <li key={key}>
              <Link className="t-row" to={`/t/customers/${encodeURIComponent(key)}`}>
                <span className="t-avatar">{initialsOf(c.name)}</span>
                <div className="t-row-main">
                  <div className="t-row-top">
                    <strong>{c.name}</strong>
                    {c.latestQuote && <StatusPill status={c.latestQuote.status} />}
                  </div>
                  <span className="t-row-sub">
                    {c.phone} · {c.jobCount} job{c.jobCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="t-row-side">
                  {c.latestQuote && <span className="t-money">{formatGbp(c.latestQuote.totalPence)}</span>}
                  <IconChevron />
                </div>
              </Link>
            </li>
          );
        }
        )}
      </ul>

      {customers.data?.length === 0 && (
        <>
          <EmptyState
            title="No customers yet"
            hint="Add a contact, or wait for the first missed-call enquiry."
          />
          <Link className="primary t-btn--block" to="/t/customers/new" style={{ marginTop: 12 }}>
            Add a customer
          </Link>
        </>
      )}
    </div>
  );
}
