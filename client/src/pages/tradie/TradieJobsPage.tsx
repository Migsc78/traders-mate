import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, tradieApi } from "../../api/tradie";
import { EmptyState, IconChevron, StatusPill } from "./ui";

export default function TradieJobsPage() {
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const jobs = useQuery({
    queryKey: ["tradie-jobs"],
    queryFn: () => tradieApi.jobs(),
  });

  return (
    <div>
      <header className="t-page-head t-page-head--row">
        <div>
          <h2>Jobs</h2>
          <p>Work you’ve taken on — missed calls land in Inbox first</p>
        </div>
        <Link className="t-add-btn" to="/t/jobs/new" aria-label="Add job">
          +
        </Link>
      </header>

      {me.data && !me.data.caps.claude && (
        <p className="error">Claude API key not set on the server — ask your admin to add it in Settings.</p>
      )}

      {jobs.isLoading && <p className="muted-text">Loading…</p>}
      {jobs.isError && <p className="error">{(jobs.error as Error).message}</p>}

      <ul className="t-list">
        {(jobs.data || []).map((j: {
          id: string;
          name: string;
          phone: string;
          message: string | null;
          postcode: string | null;
          distanceMiles: number | null;
          photoUrls: string[];
          createdAt: string;
          latestQuote: { id: string; status: string; totalPence: number } | null;
        }) => (
          <li key={j.id}>
            <Link className="t-row" to={`/t/jobs/${j.id}`}>
              <div className="t-row-main">
                <div className="t-row-top">
                  <strong>{j.name}</strong>
                  {j.latestQuote ? <StatusPill status={j.latestQuote.status} /> : <span className="t-pill t-pill--orange">New</span>}
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
            </Link>
          </li>
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
