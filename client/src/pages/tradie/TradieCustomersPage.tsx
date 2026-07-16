import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, tradieApi } from "../../api/tradie";

export default function TradieCustomersPage() {
  const customers = useQuery({ queryKey: ["tradie-customers"], queryFn: () => tradieApi.customers() });

  return (
    <div>
      <h2>Customers</h2>
      <p className="muted-text">People who&apos;ve enquired via your site, forms, or missed-call rescue</p>
      {customers.isLoading && <p>Loading…</p>}
      {customers.isError && <p className="error">{(customers.error as Error).message}</p>}
      <ul className="tradie-jobs">
        {(customers.data || []).map((c: { phone: string; name: string; jobCount: number; lastEnquiryId: string; latestQuote: { id: string; status: string; totalPence: number } | null }) => (
          <li key={c.phone}>
            <Link to={`/t/jobs/${c.lastEnquiryId}`}>
              <strong>{c.name}</strong>
              <span className="muted-text">
                {c.phone} · {c.jobCount} job{c.jobCount === 1 ? "" : "s"}
                {c.latestQuote
                  ? ` · ${c.latestQuote.status} ${formatGbp(c.latestQuote.totalPence)}`
                  : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {customers.data?.length === 0 && <p className="muted-text">No customers yet.</p>}
    </div>
  );
}
