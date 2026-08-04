import { useState } from "react";
import { Link } from "react-router-dom";
import { FILE_CATEGORIES, type CustomerFileDto, type CustomerRecord } from "../../../../api/customers";
import { IconChevron } from "../../ui";
import { dueTone, fmtDate } from "../format";

function sizeOf(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Screen 8 (left) — files by category, with expiry surfaced.
 *
 * A gas certificate that lapses is a job, so the expiry date is coloured the same
 * way an asset's next-due is. Visibility is shown on every row: internal is the
 * default, and the tradie should be able to see at a glance which files a
 * customer can actually see.
 */
export default function FilesTab({ record }: { record: CustomerRecord }) {
  const [open, setOpen] = useState<string | null>(null);

  const byCategory = new Map<string, CustomerFileDto[]>();
  for (const c of FILE_CATEGORIES) byCategory.set(c.id, []);
  for (const f of record.files) byCategory.get(f.category)?.push(f);

  return (
    <div>
      {FILE_CATEGORIES.map((cat) => {
        const files = byCategory.get(cat.id) || [];
        if (files.length === 0) return null;
        const isOpen = open === cat.id;
        return (
          <section key={cat.id} className="t-rate-section">
            <button
              type="button"
              className="t-rate-section-head"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : cat.id)}
            >
              <span className="t-rate-section-icon" aria-hidden="true">
                📁
              </span>
              <strong>{cat.label}</strong>
              <span className="muted-text">
                {files.length} file{files.length === 1 ? "" : "s"}
              </span>
              <span className={`t-rate-caret${isOpen ? " is-open" : ""}`} aria-hidden="true">
                ⌄
              </span>
            </button>

            {isOpen && (
              <div className="t-rate-section-body">
                {files.map((f) => {
                  const tone = dueTone(f.expiresAt);
                  return (
                    <a
                      key={f.id}
                      className="t-file-row"
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="t-file-main">
                        <strong>{f.filename}</strong>
                        <span className="muted-text">
                          {fmtDate(f.createdAt)}
                          {f.sizeBytes ? ` · ${sizeOf(f.sizeBytes)}` : ""}
                        </span>
                        {f.expiresAt && (
                          <span className={tone ? `t-due t-due--${tone}` : "muted-text"}>
                            Expires {fmtDate(f.expiresAt)}
                          </span>
                        )}
                      </div>
                      <span className={`t-mini-pill${f.visibility === "CUSTOMER" ? " is-shared" : ""}`}>
                        {f.visibility === "CUSTOMER" ? "Customer" : "Internal"}
                      </span>
                      <IconChevron />
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {record.files.length === 0 && (
        <p className="muted-text">No files yet — certificates, manuals and photos live here.</p>
      )}

      <Link className="primary t-btn--block" to={`/t/customers/${record.id}/files/new`}>
        + Upload file
      </Link>
    </div>
  );
}
