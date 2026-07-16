import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, tradieApi } from "../../api/tradie";

export default function TradieQuotesPage() {
  const quotes = useQuery({ queryKey: ["tradie-quotes"], queryFn: () => tradieApi.quotes() });

  return (
    <div>
      <h2>Quotes</h2>
      <p className="muted-text">Sent, accepted, and declined quotes</p>
      {quotes.isLoading && <p>Loading…</p>}
      {quotes.isError && <p className="error">{(quotes.error as Error).message}</p>}
      <ul className="tradie-jobs">
        {(quotes.data || []).map((q: { id: string; status: string; totalPence: number; sentAt: string | null; enquiry: { id: string; name: string } | null }) => (
          <li key={q.id}>
            <Link to={q.enquiry ? `/t/jobs/${q.enquiry.id}` : "/t"}>
              <strong>{q.enquiry?.name || "Quote"}</strong>
              <span className="muted-text">
                {q.status} · {formatGbp(q.totalPence)}
                {q.sentAt ? ` · sent ${new Date(q.sentAt).toLocaleDateString("en-GB")}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {quotes.data?.length === 0 && <p className="muted-text">No quotes yet.</p>}
    </div>
  );
}
