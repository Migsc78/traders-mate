import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, sendOrQueue, tradieApi } from "../../api/tradie";
import { EmptyState, QueryError, StatusPill } from "./ui";
import { SwipeListRow } from "./SwipeListRow";
import { IconSearch, ListToolbar, useListFilter, type ListTab } from "./ListToolbar";
import { groupByDay } from "../../lib/dateGroups";

type ArchivedData = Awaited<ReturnType<typeof tradieApi.archived>>;

type QuoteRow = {
  id: string;
  status: string;
  statusBeforeArchive?: string | null;
  totalPence: number;
  sentAt: string | null;
  createdAt: string;
  enquiry: { id: string; name: string; phone?: string; postcode?: string | null } | null;
};

const TABS: readonly ListTab[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "won", label: "Won" },
];

/**
 * Which tab a quote belongs under.
 *
 * Declined and expired quotes deliberately have no tab of their own — they'd be
 * two more targets on a thumb-width row for lists most tradies never open. They
 * still show under All, with the status that says what happened.
 * Archived quotes live under More → Archived, not a fifth filter here.
 */
function tabOf(quote: QuoteRow): string | null {
  if (quote.status === "DRAFT") return "draft";
  if (quote.status === "SENT") return "sent";
  if (quote.status === "ACCEPTED") return "won";
  return null;
}

function matches(quote: QuoteRow, needle: string): boolean {
  if (!needle) return true;
  return [quote.enquiry?.name, quote.enquiry?.postcode, quote.enquiry?.phone]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

/** Open the quote itself — not the linked job, and never the Jobs tab. */
function quoteOpenPath(q: QuoteRow): string {
  const status = q.status === "ARCHIVED" ? q.statusBeforeArchive || "DRAFT" : q.status;
  if (status === "DRAFT") return `/t/quotes/${q.id}/edit`;
  return `/t/quotes/${q.id}/preview`;
}

function shortDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Postcode · date or draft state — status lives in the quiet pill, not repeated here. */
function quoteSub(q: QuoteRow, archived = false): string {
  const parts: string[] = [];
  if (q.enquiry?.postcode) parts.push(q.enquiry.postcode);
  const status = archived ? q.statusBeforeArchive || "DRAFT" : q.status;
  if (status === "DRAFT") parts.push("Not sent");
  else {
    const day = shortDay(q.sentAt);
    if (day) parts.push(day);
  }
  if (archived) parts.push("Archived");
  return parts.join(" · ") || "Quote";
}

export default function TradieQuotesPage() {
  const qc = useQueryClient();
  const quotes = useQuery({ queryKey: ["tradie-quotes"], queryFn: () => tradieApi.quotes() });

  const { tab, setTab, query, setQuery, searchOpen, toggleSearch } = useListFilter("all");
  const [actionError, setActionError] = useState("");

  /** See TradieJobsPage — the row leaves the cached list before the round trip, and
   *  the snapshot is what puts it back if the write can't even be queued. */
  const dropRow = (id: string) => {
    const previous = qc.getQueryData<QuoteRow[]>(["tradie-quotes"]);
    qc.setQueryData<QuoteRow[]>(["tradie-quotes"], (rows) => (rows || []).filter((r) => r.id !== id));
    return { previous };
  };

  const putBack = (ctx: { previous?: QuoteRow[] } | undefined) => {
    if (ctx?.previous) qc.setQueryData<QuoteRow[]>(["tradie-quotes"], ctx.previous);
    setActionError("That didn’t save — the quote is still here. Try again.");
  };

  const archive = useMutation({
    mutationFn: (q: QuoteRow) =>
      sendOrQueue({
        label: `Archive quote · ${q.enquiry?.name || "quote"}`,
        path: `/quotes/${q.id}/archive`,
        method: "POST",
        body: {},
        invalidates: ["tradie-quotes", "tradie-archived"],
      }),
    onMutate: (q) => dropRow(q.id),
    onError: (_err, _q, ctx) => putBack(ctx),
    onSuccess: (r) => {
      setActionError("");
      if (!r.queued) void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
    },
  });

  const remove = useMutation({
    mutationFn: (q: QuoteRow) =>
      sendOrQueue({
        label: `Delete quote · ${q.enquiry?.name || "quote"}`,
        path: `/quotes/${q.id}`,
        method: "DELETE",
        body: {},
        invalidates: ["tradie-quotes", "tradie-jobs"],
      }),
    onMutate: (q) => dropRow(q.id),
    onError: (_err, _q, ctx) => putBack(ctx),
    onSuccess: (r) => {
      setActionError("");
      if (!r.queued) {
        void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
        void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      }
    },
  });

  const needle = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const all = (quotes.data || []) as QuoteRow[];
    const tally: Record<string, number> = { all: all.length, draft: 0, sent: 0, won: 0 };
    for (const q of all) {
      const id = tabOf(q);
      if (id) tally[id] += 1;
    }
    return tally;
  }, [quotes.data]);

  const groups = useMemo(() => {
    const rows = ((quotes.data || []) as QuoteRow[])
      .filter((q) => (tab === "all" ? true : tabOf(q) === tab))
      .filter((q) => matches(q, needle));
    return groupByDay(rows, (q) => q.createdAt);
  }, [quotes.data, tab, needle]);

  const confirmDelete = (q: QuoteRow) => {
    const label = q.enquiry?.name || "this quote";
    if (!window.confirm(`Delete quote for ${label}? This can’t be undone.`)) return;
    remove.mutate(q);
  };

  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const loading = quotes.isLoading;

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Quotes</h2>
        </div>
        <div className="t-head-actions">
          <button
            type="button"
            className={`t-icon-btn${searchOpen ? " is-active" : ""}`}
            aria-label={searchOpen ? "Close search" : "Search quotes"}
            aria-pressed={searchOpen}
            onClick={toggleSearch}
          >
            <IconSearch />
          </button>
          <Link className="t-add-btn" to="/t/quotes/new" aria-label="New quote">
            +
          </Link>
        </div>
      </header>

      <ListToolbar
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        query={query}
        onQuery={setQuery}
        searchOpen={searchOpen}
        placeholder="Search customer or postcode"
        counts={counts}
      />

      {loading && <p className="muted-text">Loading…</p>}
      <QueryError error={quotes.error} />
      {actionError && <p className="error">{actionError}</p>}

      {groups.map((group) => (
        <section key={group.key} className="t-day-group">
          <h3 className="t-day-head">{group.label}</h3>
          <ul className="t-list">
            {group.rows.map((q) => (
              <SwipeListRow
                key={q.id}
                to={quoteOpenPath(q)}
                linkState={{ from: "/t/quotes", fromLabel: "Quotes" }}
                onArchive={() => archive.mutate(q)}
                onDelete={() => confirmDelete(q)}
              >
                <div className="t-row-main">
                  <div className="t-row-top">
                    <strong>{q.enquiry?.name || "Quote"}</strong>
                    <StatusPill status={q.status} quiet />
                  </div>
                  <span className="t-row-sub">{quoteSub(q)}</span>
                </div>
                <div className="t-row-side">
                  <span className="t-money">{formatGbp(q.totalPence)}</span>
                </div>
              </SwipeListRow>
            ))}
          </ul>
        </section>
      ))}

      {!loading && total === 0 && needle && (
        <EmptyState title={`No quotes match “${query.trim()}”`} hint="Try a customer name or postcode." />
      )}

      {!loading && total === 0 && !needle && tab !== "all" && (
        <EmptyState
          title={`Nothing under ${TABS.find((t) => t.id === tab)?.label}`}
          hint="Tap All to see every quote."
        />
      )}

      {!loading && total === 0 && !needle && tab === "all" && (
        <EmptyState title="No quotes yet" hint="Tap + to build one, or open a job and quote from notes." />
      )}
    </div>
  );
}
