import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { customersApi } from "../../../../api/customers";
import { formatGbp } from "../../../../api/tradie";
import { IconChevron, QueryError, StatusPill } from "../../ui";
import { fmtDate } from "../format";

/** Where a job sits, in the words the wireframe uses on the chips. */
function bucketOf(pipeline: string, quoteStatus: string | undefined): "new" | "progress" | "done" {
  if (quoteStatus === "ACCEPTED") return "progress";
  if (pipeline === "ARCHIVED" || pipeline === "KILLED") return "done";
  if (!quoteStatus) return "new";
  return "progress";
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "progress", label: "In progress" },
  { id: "done", label: "Completed" },
] as const;

/** Screen 6 — every job for this customer, tagged with the property it's at. */
export default function JobsTab({ customerId }: { customerId: string }) {
  const jobs = useQuery({
    queryKey: ["tradie-customer-jobs", customerId],
    queryFn: () => customersApi.jobs(customerId),
  });

  // Local state, not the URL: the record page already owns a `tab` param, and
  // stacking a second one would make the back button behave oddly for a filter
  // this minor.
  const [filter, setFilter] = useState<string>("all");

  const all = jobs.data || [];
  const counts = useMemo(() => {
    const tally: Record<string, number> = { all: all.length, new: 0, progress: 0, done: 0 };
    for (const j of all) tally[bucketOf(j.pipeline, j.latestQuote?.status)] += 1;
    return tally;
  }, [all]);

  const rows = filter === "all" ? all : all.filter((j) => bucketOf(j.pipeline, j.latestQuote?.status) === filter);

  return (
    <div>
      {jobs.isLoading && <p className="muted-text">Loading jobs…</p>}
      <QueryError error={jobs.error} />

      <div className="t-chip-row">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`t-chip${f.id === filter ? " is-active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label} ({counts[f.id] ?? 0})
          </button>
        ))}
      </div>

      <ul className="t-list">
        {rows.map((j) => (
          <li key={j.id}>
            <Link
              className="t-row"
              to={`/t/jobs/${j.id}`}
              state={{ from: `/t/customers/${customerId}`, fromLabel: "Customer" }}
            >
              <div className="t-row-main">
                <div className="t-row-top">
                  <strong>{j.title}</strong>
                  {j.latestQuote ? (
                    <StatusPill status={j.latestQuote.status} />
                  ) : (
                    <span className="t-pill t-pill--orange">New</span>
                  )}
                </div>
                <span className="t-row-sub">
                  {j.property?.nickname || j.property?.postcode || "No property"} · {fmtDate(j.createdAt)}
                </span>
              </div>
              <div className="t-row-side">
                {j.latestQuote && <span className="t-money">{formatGbp(j.latestQuote.totalPence)}</span>}
                <IconChevron />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {!jobs.isLoading && rows.length === 0 && (
        <p className="muted-text">
          {all.length === 0 ? "No jobs for this customer yet." : "Nothing under that filter."}
        </p>
      )}

      <Link className="primary t-btn--block" to={`/t/jobs/new?customerId=${customerId}`}>
        + New job
      </Link>
    </div>
  );
}
