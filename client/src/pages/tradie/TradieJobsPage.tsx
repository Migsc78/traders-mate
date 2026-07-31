import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, sendOrQueue, tradieApi } from "../../api/tradie";
import { EmptyState, QueryError, IconChevron, StatusPill } from "./ui";
import { SwipeListRow } from "./SwipeListRow";

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

export default function TradieJobsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const jobs = useQuery({
    queryKey: ["tradie-jobs"],
    queryFn: () => tradieApi.jobs(),
  });

  /**
   * Drop the row from the cached list straight away.
   *
   * Swipe has to feel the same with or without signal, so the row can't sit there
   * waiting for a round trip. The cache is what the list renders from and it's
   * persisted, so this survives a restart too; if the queued write is ultimately
   * rejected, the next refetch brings the row back rather than losing it quietly.
   */
  const dropRow = (id: string) => {
    qc.setQueryData<JobRow[]>(["tradie-jobs"], (rows) => (rows || []).filter((r) => r.id !== id));
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
    onSuccess: (r) => {
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
    onSuccess: (r) => {
      if (!r.queued) void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
    },
  });

  const busy = archive.isPending || remove.isPending;

  const confirmDelete = (job: JobRow) => {
    if (!window.confirm(`Delete job for ${job.name}? This can’t be undone.`)) return;
    remove.mutate(job);
  };

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Jobs</h2>
          <p>Swipe right to archive · left to delete</p>
        </div>
        <Link className="t-add-btn" to="/t/jobs/new" aria-label="Add job">
          +
        </Link>
      </header>

      {me.data && !me.data.caps.claude && (
        <p className="error">Claude API key not set on the server — ask your admin to add it in Settings.</p>
      )}

      {jobs.isLoading && <p className="muted-text">Loading…</p>}
      <QueryError error={jobs.error} />

      <ul className="t-list">
        {(jobs.data || []).map((j: JobRow) => (
          <SwipeListRow
            key={j.id}
            to={`/t/jobs/${j.id}`}
            busy={busy}
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
        ))}
      </ul>

      {jobs.data?.length === 0 && (
        <EmptyState
          title="No jobs yet"
          hint="Promote something from Inbox, or tap + to add a walk-up job."
        />
      )}

      {jobs.data?.length === 0 && (
        <div className="tradie-actions" style={{ marginTop: 12, flexDirection: "column", gap: 8 }}>
          <Link className="primary t-btn--block" to="/t/jobs/new">
            Add a job
          </Link>
          <Link className="t-btn t-btn--block" to="/t/inbox">
            Open Inbox
          </Link>
        </div>
      )}
    </div>
  );
}
