import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tRequest } from "../../../../api/tradie";
import type { JobDetail } from "../../../../api/jobs";
import { QueryError } from "../../ui";
import { fmtDate } from "../../customer/format";

type JobFile = {
  id: string;
  filename: string;
  url: string;
  category: string;
  visibility: "INTERNAL" | "CUSTOMER";
  createdAt: string;
  scope: "job" | "property" | "customer";
};

const SCOPE_LABEL: Record<JobFile["scope"], string> = {
  job: "This job",
  property: "Property",
  customer: "Customer",
};

/**
 * Photos, certificates and receipts.
 *
 * Shows files from the property as well as the job. The gas certificate lives on
 * the property record, but the engineer wanting to check it is looking at the
 * job — making him go and find it is how it stops getting filed at all. Each row
 * says where it actually lives so nothing looks like it was taken today.
 */
export default function FilesTab({ detail }: { detail: JobDetail }) {
  const files = useQuery({
    queryKey: ["tradie-job-files", detail.id],
    queryFn: () => tRequest<JobFile[]>(`/jobs/${detail.id}/files`),
    enabled: !!detail.id,
  });

  const customerId = detail.job.customer?.id;

  return (
    <section>
      <QueryError error={files.error} />
      {files.isLoading && !files.data && <p className="muted-text">Loading…</p>}

      <ul className="t-list">
        {(files.data || []).map((f) => (
          <li key={f.id}>
            <a className="t-file-row" href={f.url} target="_blank" rel="noreferrer">
              <div className="t-file-main">
                <strong>{f.filename}</strong>
                <span className="muted-text">
                  {SCOPE_LABEL[f.scope]} · {fmtDate(f.createdAt)}
                </span>
              </div>
              <span className={`t-mini-pill${f.visibility === "CUSTOMER" ? " is-shared" : ""}`}>
                {f.visibility === "CUSTOMER" ? "Customer" : "Internal"}
              </span>
            </a>
          </li>
        ))}
      </ul>

      {!files.isLoading && (files.data?.length ?? 0) === 0 && (
        <p className="muted-text">
          No photos or certificates on this job yet. Before-and-after shots are the cheapest way to
          settle an argument six months later.
        </p>
      )}

      {customerId ? (
        <Link
          className="primary t-btn--block"
          to={`/t/customers/${customerId}/files/new?jobId=${detail.id}${
            detail.job.property ? `&propertyId=${detail.job.property.id}` : ""
          }`}
        >
          + Upload a file
        </Link>
      ) : (
        <>
          <button type="button" className="primary t-btn--block" disabled>
            + Upload a file
          </button>
          <p className="t-cta-hint">
            {/* Honest rather than mysterious: files are filed under a customer, and
                this job hasn't got one yet. */}
            This job isn&apos;t linked to a customer record yet, and files are filed under the
            customer.
          </p>
        </>
      )}
    </section>
  );
}
