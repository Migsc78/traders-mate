import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, sendOrQueue, tradieApi } from "../../api/tradie";
import { EmptyState, QueryError, IconChevron, StatusPill } from "./ui";
import { SwipeListRow } from "./SwipeListRow";
import { IconSearch, ListToolbar, useListFilter, type ListTab } from "./ListToolbar";
import { groupByDay } from "../../lib/dateGroups";

type ArchivedData = Awaited<ReturnType<typeof tradieApi.archived>>;

type JobRow = {
  id: string;
  name: string;
  phone: string;
  message: string | null;
  postcode: string | null;
  distanceMiles: number | null;
  createdAt: string;
  latestQuote: { id: string; status: string; totalPence: number } | null;
};

const TABS: readonly ListTab[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "quote", label: "Quote" },
  { id: "won", label: "Won" },
  { id: "archive", label: "Archive" },
];

/**
 * Which tab a job belongs under.
 *
 * Named for where the job is in the tradie's head, not for the quote status enum:
 * nobody thinks "this enquiry has an ACCEPTED quote", they think they won it.
 */
function tabOf(job: JobRow): "new" | "quote" | "won" {
  const status = job.latestQuote?.status;
  if (!status) return "new";
  if (status === "ACCEPTED") return "won";
  return "quote";
}

function matches(job: JobRow, needle: string): boolean {
  if (!needle) return true;
  return [job.name, job.postcode, job.phone, job.message]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

export default function TradieJobsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const jobs = useQuery({
    queryKey: ["tradie-jobs"],
    queryFn: () => tradieApi.jobs(),
  });

  const { tab, setTab, query, setQuery, searchOpen, toggleSearch } = useListFilter("all");
  const onArchiveTab = tab === "archive";
  const [actionError, setActionError] = useState("");

  // Only fetched once the tradie actually opens the Archive tab — it's the one
  // list they rarely look at, and it's already cached for offline use elsewhere.
  const archived = useQuery({
    queryKey: ["tradie-archived"],
    queryFn: () => tradieApi.archived(),
    enabled: onArchiveTab,
  });

  /**
   * Drop the row from the cached list straight away, handing back what was there.
   *
   * Swipe has to feel the same with or without signal, so the row can't sit there
   * waiting for a round trip. The cache is what the list renders from and it's
   * persisted, so this survives a restart too. The snapshot is the undo: if the
   * write can't even be queued, onError puts the list back exactly as it was
   * rather than leaving the tradie a row short and none the wiser.
   */
  const dropRow = (id: string) => {
    const previous = qc.getQueryData<JobRow[]>(["tradie-jobs"]);
    qc.setQueryData<JobRow[]>(["tradie-jobs"], (rows) => (rows || []).filter((r) => r.id !== id));
    return { previous };
  };

  const putBack = (ctx: { previous?: JobRow[] } | undefined) => {
    if (ctx?.previous) qc.setQueryData<JobRow[]>(["tradie-jobs"], ctx.previous);
    setActionError("That didn’t save — the job is still here. Try again.");
  };

  const archive = useMutation({
    mutationFn: (job: JobRow) =>
      sendOrQueue({
        label: `Archive job · ${job.name}`,
        path: `/jobs/${job.id}/archive`,
        method: "POST",
        body: {},
        invalidates: ["tradie-jobs", "tradie-archived"],
      }),
    onMutate: (job) => dropRow(job.id),
    onError: (_err, _job, ctx) => putBack(ctx),
    onSuccess: (r) => {
      setActionError("");
      if (!r.queued) void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
    },
  });

  const remove = useMutation({
    mutationFn: (job: JobRow) =>
      sendOrQueue({
        label: `Delete job · ${job.name}`,
        path: `/jobs/${job.id}`,
        method: "DELETE",
        body: {},
        invalidates: ["tradie-jobs"],
      }),
    onMutate: (job) => dropRow(job.id),
    onError: (_err, _job, ctx) => putBack(ctx),
    onSuccess: (r) => {
      setActionError("");
      if (!r.queued) void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
    },
  });

  const restore = useMutation({
    mutationFn: (job: JobRow) =>
      sendOrQueue({
        label: `Restore job · ${job.name}`,
        path: `/jobs/${job.id}/unarchive`,
        method: "POST",
        body: {},
        invalidates: ["tradie-jobs", "tradie-archived"],
      }),
    // Move the row across both cached lists now. Restore has to feel the same
    // with no signal as archiving already does — tapping it and watching nothing
    // happen is the exact complaint that got the offline work started.
    onMutate: (job) => {
      const previousArchived = qc.getQueryData<ArchivedData>(["tradie-archived"]);
      const previousJobs = qc.getQueryData<JobRow[]>(["tradie-jobs"]);
      qc.setQueryData<ArchivedData>(["tradie-archived"], (prev) =>
        prev ? { ...prev, jobs: prev.jobs.filter((j) => j.id !== job.id) } : prev
      );
      qc.setQueryData<JobRow[]>(["tradie-jobs"], (rows) => [job, ...(rows || [])]);
      return { previousArchived, previousJobs };
    },
    onError: (_err, _job, ctx) => {
      if (ctx?.previousArchived) qc.setQueryData(["tradie-archived"], ctx.previousArchived);
      if (ctx?.previousJobs) qc.setQueryData(["tradie-jobs"], ctx.previousJobs);
      setActionError("Couldn’t restore that one. Try again.");
    },
    onSuccess: (r) => {
      setActionError("");
      if (!r.queued) {
        void qc.invalidateQueries({ queryKey: ["tradie-archived"] });
        void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
      }
    },
  });

  const needle = query.trim().toLowerCase();

  const counts = useMemo(() => {
    const all = jobs.data || [];
    const tally = { all: all.length, new: 0, quote: 0, won: 0, archive: 0 };
    for (const j of all) tally[tabOf(j as JobRow)] += 1;
    return tally;
  }, [jobs.data]);

  const groups = useMemo(() => {
    const rows = ((jobs.data || []) as JobRow[])
      .filter((j) => (tab === "all" ? true : tabOf(j) === tab))
      .filter((j) => matches(j, needle));
    return groupByDay(rows, (j) => j.createdAt);
  }, [jobs.data, tab, needle]);

  const archivedRows = useMemo(() => {
    const rows = ((archived.data?.jobs || []) as JobRow[]).filter((j) => matches(j, needle));
    return groupByDay(rows, (j) => j.createdAt);
  }, [archived.data, needle]);

  const confirmDelete = (job: JobRow) => {
    if (!window.confirm(`Delete job for ${job.name}? This can’t be undone.`)) return;
    remove.mutate(job);
  };

  const shown = onArchiveTab ? archivedRows : groups;
  const total = shown.reduce((n, g) => n + g.rows.length, 0);
  const loading = onArchiveTab ? archived.isLoading : jobs.isLoading;

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Jobs</h2>
          <p>Swipe right to archive · left to delete</p>
        </div>
        <div className="t-head-actions">
          <button
            type="button"
            className={`t-icon-btn${searchOpen ? " is-active" : ""}`}
            aria-label={searchOpen ? "Close search" : "Search jobs"}
            aria-pressed={searchOpen}
            onClick={toggleSearch}
          >
            <IconSearch />
          </button>
          <Link className="t-add-btn" to="/t/jobs/new" aria-label="Add job">
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
        placeholder="Search name, postcode or notes"
        counts={counts}
      />

      {me.data && !me.data.caps.claude && (
        <p className="error">Claude API key not set on the server — ask your admin to add it in Settings.</p>
      )}

      {loading && <p className="muted-text">Loading…</p>}
      <QueryError error={onArchiveTab ? archived.error : jobs.error} />
      {actionError && <p className="error">{actionError}</p>}

      {shown.map((group) => (
        <section key={group.key} className="t-day-group">
          <h3 className="t-day-head">{group.label}</h3>
          <ul className="t-list">
            {group.rows.map((j) =>
              onArchiveTab ? (
                <li key={j.id}>
                  <div className="t-row t-row--static">
                    <Link
                      className="t-row-main t-row-main--link"
                      to={`/t/jobs/${j.id}`}
                      state={{ from: "/t", fromLabel: "Jobs" }}
                    >
                      <div className="t-row-top">
                        <strong>{j.name}</strong>
                        {j.latestQuote ? (
                          <StatusPill status={j.latestQuote.status} />
                        ) : (
                          <span className="t-pill t-pill--grey">Archived</span>
                        )}
                      </div>
                      <span className="t-row-sub">{j.postcode || j.phone}</span>
                      {j.message && <span className="t-row-snip">{j.message}</span>}
                    </Link>
                    <div className="t-row-side t-row-side--stack">
                      {j.latestQuote && <span className="t-money">{formatGbp(j.latestQuote.totalPence)}</span>}
                      <button
                        type="button"
                        className="t-btn"
                        disabled={restore.isPending}
                        onClick={() => restore.mutate(j)}
                      >
                        Restore
                      </button>
                    </div>
                  </div>
                </li>
              ) : (
                <SwipeListRow
                  key={j.id}
                  to={`/t/jobs/${j.id}`}
                  onArchive={() => archive.mutate(j)}
                  onDelete={() => confirmDelete(j)}
                >
                  <div className="t-row-main">
                    <div className="t-row-top">
                      <strong>{j.name}</strong>
                      {j.latestQuote ? (
                        <StatusPill status={j.latestQuote.status} />
                      ) : (
                        <span className="t-pill t-pill--orange">New</span>
                      )}
                    </div>
                    <span className="t-row-sub">
                      {j.postcode || j.phone}
                      {j.distanceMiles != null ? ` · ~${j.distanceMiles} mi` : ""}
                    </span>
                    {j.message && <span className="t-row-snip">{j.message}</span>}
                  </div>
                  <div className="t-row-side">
                    {j.latestQuote && <span className="t-money">{formatGbp(j.latestQuote.totalPence)}</span>}
                    <IconChevron />
                  </div>
                </SwipeListRow>
              )
            )}
          </ul>
        </section>
      ))}

      {!loading && total === 0 && needle && (
        <EmptyState title={`No jobs match “${query.trim()}”`} hint="Try a name, postcode or phone number." />
      )}

      {!loading && total === 0 && !needle && onArchiveTab && (
        <EmptyState title="No archived jobs" hint="Swipe right on a job to archive it." />
      )}

      {!loading && total === 0 && !needle && !onArchiveTab && tab !== "all" && (
        <EmptyState
          title={`Nothing under ${TABS.find((t) => t.id === tab)?.label}`}
          hint="Tap All to see every job."
        />
      )}

      {!loading && total === 0 && !needle && tab === "all" && (
        <>
          <EmptyState
            title="No jobs yet"
            hint="Promote something from Inbox, or tap + to add a walk-up job."
          />
          <div className="tradie-actions" style={{ marginTop: 12, flexDirection: "column", gap: 8 }}>
            <Link className="primary t-btn--block" to="/t/jobs/new">
              Add a job
            </Link>
            <Link className="t-btn t-btn--block" to="/t/inbox">
              Open Inbox
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
