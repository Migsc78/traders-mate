import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { formatGbp, tradieApi } from "../../api/tradie";

export default function TradieJobsPage() {
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const jobs = useQuery({
    queryKey: ["tradie-jobs"],
    queryFn: () => tradieApi.jobs(),
  });

  return (
    <div>
      <h2>Jobs</h2>
      <p className="muted-text">Recent enquiries — tap to quote</p>

      {me.data && !me.data.caps.claude && (
        <p className="error">Claude API key not set on the server — ask your admin to add it in Settings.</p>
      )}

      {jobs.isLoading && <p>Loading…</p>}
      {jobs.isError && <p className="error">{(jobs.error as Error).message}</p>}

      <ul className="tradie-jobs">
        {(jobs.data || []).map((j: { id: string; name: string; phone: string; message: string | null; postcode: string | null; latestQuote: { id: string; status: string; totalPence: number } | null }) => (
          <li key={j.id}>
            <Link to={`/t/jobs/${j.id}`}>
              <strong>{j.name}</strong>
              <span className="muted-text">
                {j.postcode || j.phone}
                {j.latestQuote ? ` · ${j.latestQuote.status} ${formatGbp(j.latestQuote.totalPence)}` : " · no quote yet"}
              </span>
              {j.message && <span className="tradie-snip">{j.message}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {jobs.data?.length === 0 && (
        <p className="muted-text">
          No jobs yet. Share your intake link, enable missed-call divert, or forward email to{" "}
          {me.data?.inboundEmail || "your inbound address"}.
        </p>
      )}
    </div>
  );
}
