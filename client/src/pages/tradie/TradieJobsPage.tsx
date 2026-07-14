import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { formatGbp, getTradieSession, setTradieSession, tradieApi } from "../../api/tradie";

export default function TradieJobsPage() {
  const session = getTradieSession();
  const me = useQuery({
    queryKey: ["tradie-me"],
    queryFn: () => tradieApi.me(),
    enabled: !!session,
    retry: false,
  });
  const jobs = useQuery({
    queryKey: ["tradie-jobs"],
    queryFn: () => tradieApi.jobs(),
    enabled: !!session && me.isSuccess,
  });

  useEffect(() => {
    if (me.isError) setTradieSession(null);
  }, [me.isError]);

  if (!session || me.isError) return <Navigate to="/t/auth" replace />;

  return (
    <div className="tradie-shell">
      <header className="tradie-top">
        <div>
          <h1>{me.data?.businessName || "Jobs"}</h1>
          <p className="muted-text">Recent enquiries — tap to quote</p>
        </div>
        <div className="tradie-actions">
          <Link to="/t/price-book">Price book</Link>
          <button
            className="linkish"
            onClick={() => {
              setTradieSession(null);
              window.location.href = "/t/auth";
            }}
          >
            Sign out
          </button>
        </div>
      </header>

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
      {jobs.data?.length === 0 && <p className="muted-text">No jobs yet — new website enquiries will show here.</p>}
    </div>
  );
}
