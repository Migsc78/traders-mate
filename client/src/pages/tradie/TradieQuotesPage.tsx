import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, tradieApi } from "../../api/tradie";
import { EmptyState, IconChevron, StatusPill } from "./ui";

export default function TradieQuotesPage() {
  const quotes = useQuery({ queryKey: ["tradie-quotes"], queryFn: () => tradieApi.quotes() });

  return (
    <div>
      <header className="t-page-head">
        <h2>Quotes</h2>
        <p>Everything you&apos;ve priced — sent, accepted, declined</p>
      </header>

      {quotes.isLoading && <p className="muted-text">Loading…</p>}
      {quotes.isError && <p className="error">{(quotes.error as Error).message}</p>}

      <ul className="t-list">
        {(quotes.data || []).map((q: { id: string; status: string; totalPence: number; sentAt: string | null; enquiry: { id: string; name: string } | null }) => (
          <li key={q.id}>
            <Link className="t-row" to={q.enquiry ? `/t/jobs/${q.enquiry.id}` : "/t"}>
              <div className="t-row-main">
                <div className="t-row-top">
                  <strong>{q.enquiry?.name || "Quote"}</strong>
                  <StatusPill status={q.status} />
                </div>
                <span className="t-row-sub">
                  {q.sentAt ? `Sent ${new Date(q.sentAt).toLocaleDateString("en-GB")}` : "Not sent yet"}
                </span>
              </div>
              <div className="t-row-side">
                <span className="t-money">{formatGbp(q.totalPence)}</span>
                <IconChevron />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {quotes.data?.length === 0 && (
        <EmptyState title="No quotes yet" hint="Open a job and draft a quote from notes or voice." />
      )}
    </div>
  );
}
