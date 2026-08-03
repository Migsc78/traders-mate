import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, sendOrQueue, tradieApi } from "../../api/tradie";
import { EmptyState, QueryError, IconChevron, StatusPill } from "./ui";
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
  { id: "archive", label: "Archive" },
];

/**
 * Which tab a quote belongs under.
 *
 * Declined and expired quotes deliberately have no tab of their own — they'd be
 * two more targets on a thumb-width row for lists most tradies never open. They
 * still show under All, with the pill that says what happened.
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

export default function TradieQuotesPage() {
  const qc = useQueryClient();
  const quotes = useQuery({ queryKey: ["tradie-quotes"], queryFn: () => tradieApi.quotes() });

  const { tab, setTab, query, setQuery, searchOpen, toggleSearch } = useListFilter("all");
  const onArchiveTab = tab === "archive";
  const [actionError, setActionError] = useState("");

  const archived = useQuery({
    queryKey: ["tradie-archived"],
    queryFn: () => tradieApi.archived(),
    enabled: onArchiveTab,
  });

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

  const restore = useMutation({
    mutationFn: (q: QuoteRow) =>
      sendOrQueue({
        label: `Restore quote · ${q.enquiry?.name || "quote"}`,
        path: `/quotes/${q.id}/unarchive`,
        method: "POST",
        body: {},
        invalidates: ["tradie-quotes", "tradie-archived"],
      }),
    // See TradieJobsPage — the row moves between both cached lists immediately so
    // restoring works the same with no signal.
    onMutate: (q) => {
      const previousArchived = qc.getQueryData<ArchivedData>(["tradie-archived"]);
      const previousQuotes = qc.getQueryData<QuoteRow[]>(["tradie-quotes"]);
      qc.setQueryData<ArchivedData>(["tradie-archived"], (prev) =>
        prev ? { ...prev, quotes: prev.quotes.filter((row) => row.id !== q.id) } : prev
      );
      qc.setQueryData<QuoteRow[]>(["tradie-quotes"], (rows) => [
        { ...q, status: q.statusBeforeArchive || "DRAFT" },
        ...(rows || []),
      ]);
      return { previousArchived, previousQuotes };
    },
    onError: (_err, _q, ctx) => {
      if (ctx?.previousArchived) qc.setQueryData(["tradie-archived"], ctx.previousArchived);
      if (ctx?.previousQuotes) qc.setQueryData(["tradie-quotes"], ctx.previousQuotes);
      setActionError("Couldn’t restore that one. Try again.");
    },
    onSuccess: (r) => {
      setActionError("");
      if (!r.queued) {
        void qc.invalidateQueries({ queryKey: ["tradie-archived"] });
        void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
      }
    },
  });

  const needle = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const all = (quotes.data || []) as QuoteRow[];
    const tally: Record<string, number> = { all: all.length, draft: 0, sent: 0, won: 0, archive: 0 };
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

  const archivedRows = useMemo(() => {
    const rows = ((archived.data?.quotes || []) as QuoteRow[]).filter((q) => matches(q, needle));
    return groupByDay(rows, (q) => q.createdAt);
  }, [archived.data, needle]);

  const confirmDelete = (q: QuoteRow) => {
    const label = q.enquiry?.name || "this quote";
    if (!window.confirm(`Delete quote for ${label}? This can’t be undone.`)) return;
    remove.mutate(q);
  };

  const shown = onArchiveTab ? archivedRows : groups;
  const total = shown.reduce((n, g) => n + g.rows.length, 0);
  const loading = onArchiveTab ? archived.isLoading : quotes.isLoading;

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Quotes</h2>
          <p>Swipe right to archive · left to delete</p>
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
      <QueryError error={onArchiveTab ? archived.error : quotes.error} />
      {actionError && <p className="error">{actionError}</p>}

      {shown.map((group) => (
        <section key={group.key} className="t-day-group">
          <h3 className="t-day-head">{group.label}</h3>
          <ul className="t-list">
            {group.rows.map((q) =>
              onArchiveTab ? (
                <li key={q.id}>
                  <div className="t-row t-row--static">
                    <Link
                      className="t-row-main t-row-main--link"
                      to={q.enquiry ? `/t/jobs/${q.enquiry.id}` : "/t/quotes"}
                      state={q.enquiry ? { from: "/t/quotes", fromLabel: "Quotes" } : undefined}
                    >
                      <div className="t-row-top">
                        <strong>{q.enquiry?.name || "Quote"}</strong>
                        <StatusPill status={q.statusBeforeArchive || "ARCHIVED"} />
                      </div>
                      <span className="t-row-sub">
                        {q.sentAt ? `Sent ${new Date(q.sentAt).toLocaleDateString("en-GB")}` : "Draft"}
                        {" · archived"}
                      </span>
                    </Link>
                    <div className="t-row-side t-row-side--stack">
                      <span className="t-money">{formatGbp(q.totalPence)}</span>
                      <button
                        type="button"
                        className="t-btn"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(q)}
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                </li>
              ) : (
                <SwipeListRow
                  key={q.id}
                  to={q.enquiry ? `/t/jobs/${q.enquiry.id}` : "/t"}
                  linkState={q.enquiry ? { from: "/t/quotes", fromLabel: "Quotes" } : undefined}
                  onArchive={() => archive.mutate(q)}
                  onDelete={() => confirmDelete(q)}
                >
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{q.enquiry?.name || "Quote"}</strong>
                      <StatusPill status={q.status} />
                    </div>
                    <span className="t-row-sub">
                      {q.sentAt ? `Sent ${new Date(q.sentAt).toLocaleDateString("en-GB")}` : "Not sent yet"}
                      {q.enquiry?.postcode ? ` · ${q.enquiry.postcode}` : ""}
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
        </section>
      ))}

      {!loading && total === 0 && needle && (
        <EmptyState title={`No quotes match “${query.trim()}”`} hint="Try a customer name or postcode." />
      )}

      {!loading && total === 0 && !needle && onArchiveTab && (
        <EmptyState title="No archived quotes" hint="Swipe right on a quote to archive it." />
      )}

      {!loading && total === 0 && !needle && !onArchiveTab && tab !== "all" && (
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
