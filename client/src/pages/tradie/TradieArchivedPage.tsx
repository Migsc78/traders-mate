import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, tradieApi } from "../../api/tradie";
import { EmptyState, QueryError, StatusPill } from "./ui";

type Tab = "jobs" | "quotes";

export default function TradieArchivedPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("jobs");
  const archived = useQuery({
    queryKey: ["tradie-archived"],
    queryFn: () => tradieApi.archived(),
  });

  const unarchiveJob = useMutation({
    mutationFn: (id: string) => tradieApi.unarchiveJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-archived"] });
      void qc.invalidateQueries({ queryKey: ["tradie-jobs"] });
    },
  });

  const unarchiveQuote = useMutation({
    mutationFn: (id: string) => tradieApi.unarchiveQuote(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tradie-archived"] });
      void qc.invalidateQueries({ queryKey: ["tradie-quotes"] });
    },
  });

  const jobs = archived.data?.jobs || [];
  const quotes = archived.data?.quotes || [];
  const busy = unarchiveJob.isPending || unarchiveQuote.isPending;

  return (
    <div>
      <header className="t-page-head">
        <h2>Archived</h2>
        <p>Jobs and quotes you swiped away — restore anytime</p>
      </header>

      <div className="t-seg" role="tablist" aria-label="Archived type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "jobs"}
          className={tab === "jobs" ? "on" : undefined}
          onClick={() => setTab("jobs")}
        >
          Jobs{jobs.length ? ` · ${jobs.length}` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "quotes"}
          className={tab === "quotes" ? "on" : undefined}
          onClick={() => setTab("quotes")}
        >
          Quotes{quotes.length ? ` · ${quotes.length}` : ""}
        </button>
      </div>

      {archived.isLoading && <p className="muted-text">Loading…</p>}
      <QueryError error={archived.error} />

      {tab === "jobs" && !archived.isLoading && (
        <>
          <ul className="t-list">
            {jobs.map((j: (typeof jobs)[number]) => (
              <li key={j.id}>
                <div className="t-row t-row--static">
                  <Link className="t-row-main t-row-main--link" to={`/t/jobs/${j.id}`} state={{ from: "/t/archived", fromLabel: "Archived" }}>
                    <div className="t-row-top">
                      <strong>{j.name}</strong>
                      {j.latestQuote ? (
                        <StatusPill status={j.latestQuote.status} quiet />
                      ) : (
                        <span className="t-status t-status--grey">Archived</span>
                      )}
                    </div>
                    <span className="t-row-sub">
                      {j.postcode || j.phone}
                      {j.distanceMiles != null ? ` · ~${j.distanceMiles} mi` : ""}
                    </span>
                    {j.message && <span className="t-row-snip">{j.message}</span>}
                  </Link>
                  <div className="t-row-side t-row-side--stack">
                    {j.latestQuote && <span className="t-money">{formatGbp(j.latestQuote.totalPence)}</span>}
                    <button
                      type="button"
                      className="t-btn"
                      disabled={busy}
                      onClick={() => unarchiveJob.mutate(j.id)}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {jobs.length === 0 && (
            <EmptyState title="No archived jobs" hint="Swipe right on a job to archive it." />
          )}
        </>
      )}

      {tab === "quotes" && !archived.isLoading && (
        <>
          <ul className="t-list">
            {quotes.map((q: (typeof quotes)[number]) => (
              <li key={q.id}>
                <div className="t-row t-row--static">
                  <Link
                    className="t-row-main t-row-main--link"
                    to={
                      (q.statusBeforeArchive || "DRAFT") === "DRAFT"
                        ? `/t/quotes/${q.id}/edit`
                        : `/t/quotes/${q.id}/preview`
                    }
                    state={{ from: "/t/archived", fromLabel: "Archived" }}
                  >
                    <div className="t-row-top">
                      <strong>{q.enquiry?.name || "Quote"}</strong>
                      <StatusPill status={q.statusBeforeArchive || "ARCHIVED"} quiet />
                    </div>
                    <span className="t-row-sub">
                      {q.enquiry?.postcode || "Quote"}
                      {q.sentAt
                        ? ` · ${new Date(q.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                        : " · Not sent"}
                      {" · Archived"}
                    </span>
                  </Link>
                  <div className="t-row-side t-row-side--stack">
                    <span className="t-money">{formatGbp(q.totalPence)}</span>
                    <button
                      type="button"
                      className="t-btn"
                      disabled={busy}
                      onClick={() => unarchiveQuote.mutate(q.id)}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {quotes.length === 0 && (
            <EmptyState title="No archived quotes" hint="Swipe right on a quote to archive it." />
          )}
        </>
      )}
    </div>
  );
}
