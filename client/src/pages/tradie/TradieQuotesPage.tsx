import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, tradieApi } from "../../api/tradie";
import { EmptyState, QueryError, IconChevron, StatusPill } from "./ui";
import { SwipeListRow } from "./SwipeListRow";
import { useOffline } from "../../lib/connectivity";

type QuoteRow = {
  id: string;
  status: string;
  totalPence: number;
  sentAt: string | null;
  enquiry: { id: string; name: string } | null;
};

export default function TradieQuotesPage() {
  const qc = useQueryClient();
  const offline = useOffline();
  const quotes = useQuery({ queryKey: ["tradie-quotes"], queryFn: () => tradieApi.quotes() });

  const archive = useMutation({
    mutationFn: (id: string) => tradieApi.archiveQuote(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => tradieApi.deleteQuote(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
    },
  });

  // See TradieJobsPage — swipe actions need the server, so lock them offline.
  const busy = offline || archive.isPending || remove.isPending;

  const confirmDelete = (q: QuoteRow) => {
    const label = q.enquiry?.name || "this quote";
    if (!window.confirm(`Delete quote for ${label}? This can’t be undone.`)) return;
    remove.mutate(q.id);
  };

  return (
    <div>
      <header className="t-page-head">
        <h2>Quotes</h2>
        <p>Swipe right to archive · left to delete</p>
      </header>

      {quotes.isLoading && <p className="muted-text">Loading…</p>}
      <QueryError error={quotes.error} />

      <ul className="t-list">
        {(quotes.data || []).map(
          (q: QuoteRow) => (
            <SwipeListRow
              key={q.id}
              to={q.enquiry ? `/t/jobs/${q.enquiry.id}` : "/t"}
              linkState={q.enquiry ? { from: "/t/quotes", fromLabel: "Quotes" } : undefined}
              busy={busy}
              onArchive={() => archive.mutate(q.id)}
              onDelete={() => confirmDelete(q)}
            >
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
            </SwipeListRow>
          )
        )}
      </ul>

      {quotes.data?.length === 0 && (
        <EmptyState title="No quotes yet" hint="Open a job and draft a quote from notes or voice." />
      )}
    </div>
  );
}
