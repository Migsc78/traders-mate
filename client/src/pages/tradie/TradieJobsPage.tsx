import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, sendOrQueue, tradieApi } from "../../api/tradie";
import {
  commercialTone,
  jobsApi,
  operationalTone,
  type JobBucket,
  type JobCard,
} from "../../api/jobs";
import { EmptyState, QueryError, IconChevron } from "./ui";
import { SwipeListRow } from "./SwipeListRow";
import { IconSearch, ListToolbar, useListFilter, type ListTab } from "./ListToolbar";
import { groupByDay } from "../../lib/dateGroups";

type ArchivedData = Awaited<ReturnType<typeof tradieApi.archived>>;

/**
 * The pipeline, in the order work moves through it.
 *
 * Enquiries are deliberately absent: they live in the Inbox, where a missed call
 * arrives already qualified. Jobs starts at the point something became work.
 */
const TABS: readonly ListTab[] = [
  { id: "all", label: "All" },
  { id: "to_schedule", label: "To schedule" },
  { id: "upcoming", label: "Upcoming" },
  { id: "in_progress", label: "In progress" },
  { id: "to_invoice", label: "To invoice" },
  { id: "done", label: "Done" },
  { id: "archive", label: "Archive" },
];

function matches(job: { name: string; postcode: string | null; phone: string; title?: string; message: string | null }, needle: string): boolean {
  if (!needle) return true;
  return [job.title, job.name, job.postcode, job.phone, job.message]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

/** "Thu 6 Aug, 09:00–11:00" — what the tradie told the customer, where there is one. */
function visitLine(job: JobCard): string | null {
  const v = job.nextVisit;
  if (!v) return null;
  const start = new Date(v.arrivalWindowStart || v.startsAt);
  const end = new Date(v.arrivalWindowEnd || v.endsAt);
  const day = start.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const from = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const to = end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${from}–${to}`;
}

export default function TradieJobsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const jobs = useQuery({ queryKey: ["tradie-jobs"], queryFn: () => jobsApi.list() });

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
    const previous = qc.getQueryData<JobCard[]>(["tradie-jobs"]);
    qc.setQueryData<JobCard[]>(["tradie-jobs"], (rows) => (rows || []).filter((r) => r.id !== id));
    return { previous };
  };

  const putBack = (ctx: { previous?: JobCard[] } | undefined) => {
    if (ctx?.previous) qc.setQueryData<JobCard[]>(["tradie-jobs"], ctx.previous);
    setActionError("That didn’t save — the job is still here. Try again.");
  };

  const archive = useMutation({
    mutationFn: (job: JobCard) =>
      sendOrQueue({
        label: `Archive job · ${job.title}`,
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
    mutationFn: (job: JobCard) =>
      sendOrQueue({
        label: `Delete job · ${job.title}`,
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
    mutationFn: (job: { id: string; title?: string; name: string }) =>
      sendOrQueue({
        label: `Restore job · ${job.title || job.name}`,
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
      qc.setQueryData<ArchivedData>(["tradie-archived"], (prev) =>
        prev ? { ...prev, jobs: prev.jobs.filter((j) => j.id !== job.id) } : prev
      );
      return { previousArchived };
    },
    onError: (_err, _job, ctx) => {
      if (ctx?.previousArchived) qc.setQueryData(["tradie-archived"], ctx.previousArchived);
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
  const all = useMemo(() => jobs.data || [], [jobs.data]);

  const counts = useMemo(() => {
    const tally: Record<string, number> = {
      all: all.length,
      to_schedule: 0,
      upcoming: 0,
      in_progress: 0,
      to_invoice: 0,
      done: 0,
    };
    for (const j of all) tally[j.bucket] += 1;
    return tally;
  }, [all]);

  const groups = useMemo(() => {
    const rows = all
      .filter((j) => (tab === "all" ? true : j.bucket === (tab as JobBucket)))
      .filter((j) => matches(j, needle));

    /**
     * Upcoming is the one tab that answers "what am I doing next", so it's
     * ordered and headed by when the tradie is due on site. Grouping it by when
     * the enquiry happened to arrive would put next Tuesday's boiler above
     * tomorrow morning's leak.
     */
    if (tab === "upcoming") {
      const byVisit = [...rows].sort(
        (a, b) =>
          new Date(a.nextVisit?.startsAt || a.createdAt).getTime() -
          new Date(b.nextVisit?.startsAt || b.createdAt).getTime()
      );
      return groupByDay(byVisit, (j) => j.nextVisit?.startsAt || j.createdAt, new Date(), {
        allowFuture: true,
      });
    }

    return groupByDay(rows, (j) => j.createdAt);
  }, [all, tab, needle]);

  const archivedRows = useMemo(() => {
    const rows = (archived.data?.jobs || []).filter((j) => matches(j, needle));
    return groupByDay(rows, (j) => j.createdAt);
  }, [archived.data, needle]);

  const confirmDelete = (job: JobCard) => {
    if (!window.confirm(`Delete “${job.title}”? This can’t be undone.`)) return;
    remove.mutate(job);
  };

  const total = onArchiveTab
    ? archivedRows.reduce((n, g) => n + g.rows.length, 0)
    : groups.reduce((n, g) => n + g.rows.length, 0);
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
        placeholder="Search job, name or postcode"
        counts={counts}
        // Work that's done and not billed is the only count here that costs
        // money to ignore, so it's the only one that gets colour.
        accentTabs={["to_invoice"]}
      />

      {me.data && !me.data.caps.claude && (
        <p className="error">Claude API key not set on the server — ask your admin to add it in Settings.</p>
      )}

      {loading && <p className="muted-text">Loading…</p>}
      <QueryError error={onArchiveTab ? archived.error : jobs.error} />
      {actionError && <p className="error">{actionError}</p>}

      {onArchiveTab
        ? archivedRows.map((group) => (
            <section key={group.key} className="t-day-group">
              <h3 className="t-day-head">{group.label}</h3>
              <ul className="t-list">
                {group.rows.map((j) => (
                  <li key={j.id}>
                    <div className="t-row t-row--static">
                      <Link
                        className="t-row-main t-row-main--link"
                        to={`/t/jobs/${j.id}`}
                        state={{ from: "/t", fromLabel: "Jobs" }}
                      >
                        <div className="t-row-top">
                          <strong>{j.title || j.name}</strong>
                          <span className="t-pill t-pill--grey">Archived</span>
                        </div>
                        <span className="t-row-sub">
                          {[j.name, j.postcode].filter(Boolean).join(" · ")}
                        </span>
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
                ))}
              </ul>
            </section>
          ))
        : groups.map((group) => (
            <section key={group.key} className="t-day-group">
              <h3 className="t-day-head">{group.label}</h3>
              <ul className="t-list">
                {group.rows.map((j) => {
                  const when = visitLine(j);
                  return (
                    <SwipeListRow
                      key={j.id}
                      to={`/t/jobs/${j.id}`}
                      onArchive={() => archive.mutate(j)}
                      onDelete={() => confirmDelete(j)}
                    >
                      <div className="t-row-main">
                        {/* Work title leads, customer second — a tradie looking
                            down this list is looking for the job, not the name. */}
                        <div className="t-row-top">
                          <strong>{j.title}</strong>
                        </div>
                        <span className="t-row-sub">
                          {[j.customer?.name || j.name, j.property?.postcode || j.postcode]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {when && <span className="t-row-when">🕑 {when}</span>}
                        <div className="t-badge-row">
                          {/* Two badges, never merged. One saying both is what
                              made unbilled work invisible in the first place. */}
                          <span className={`t-pill ${operationalTone(j.operational)}`}>
                            {j.operationalLabel}
                          </span>
                          <span className={`t-pill ${commercialTone(j.commercial)}`}>
                            {j.commercialLabel}
                          </span>
                        </div>
                      </div>
                      <div className="t-row-side">
                        {j.quotedTotalPence > 0 ? (
                          <span className="t-money">{formatGbp(j.quotedTotalPence)}</span>
                        ) : j.latestQuote ? (
                          <span className="t-money">{formatGbp(j.latestQuote.totalPence)}</span>
                        ) : null}
                        <IconChevron />
                      </div>
                    </SwipeListRow>
                  );
                })}
              </ul>
            </section>
          ))}

      {!loading && total === 0 && needle && (
        <EmptyState title={`No jobs match “${query.trim()}”`} hint="Try a job title, name or postcode." />
      )}

      {!loading && total === 0 && !needle && onArchiveTab && (
        <EmptyState title="No archived jobs" hint="Swipe right on a job to archive it." />
      )}

      {!loading && total === 0 && !needle && !onArchiveTab && tab === "to_invoice" && (
        <EmptyState
          title="Nothing waiting to be billed"
          hint="Completed jobs land here until you invoice them."
        />
      )}

      {!loading && total === 0 && !needle && !onArchiveTab && tab !== "all" && tab !== "to_invoice" && (
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
