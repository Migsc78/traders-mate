import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, tradieApi } from "../../api/tradie";
import { EmptyState, IconChevron, StatusPill, initialsOf } from "./ui";

export default function TradieCustomersPage() {
  const customers = useQuery({ queryKey: ["tradie-customers"], queryFn: () => tradieApi.customers() });

  return (
    <div>
      <header className="t-page-head">
        <h2>Customers</h2>
        <p>People who&apos;ve enquired via your site, forms, or missed-call rescue</p>
      </header>

      {customers.isLoading && <p className="muted-text">Loading…</p>}
      {customers.isError && <p className="error">{(customers.error as Error).message}</p>}

      <ul className="t-list">
        {(customers.data || []).map((c: { phone: string; name: string; jobCount: number; lastEnquiryId: string; latestQuote: { id: string; status: string; totalPence: number } | null }) => (
          <li key={c.phone}>
            <Link className="t-row" to={`/t/jobs/${c.lastEnquiryId}`}>
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
        ))}
      </ul>

      {customers.data?.length === 0 && (
        <EmptyState title="No customers yet" hint="Every enquiry that comes in shows up here automatically." />
      )}
    </div>
  );
}
