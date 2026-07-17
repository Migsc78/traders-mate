import type { Lead, LeadFilters, OutreachStatus } from "../types";
import { OUTREACH_STATUSES } from "../types";
import { googleDataTags } from "../lib/leadFields";
import { WebsiteClassBadge, ScorePill, DomainBadge } from "./Badges";

interface Props {
  leads: Lead[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  sort: LeadFilters["sort"];
  order: LeadFilters["order"];
  onSort: (col: LeadFilters["sort"]) => void;
  onStatusChange: (id: string, status: OutreachStatus) => void;
  onOpen: (lead: Lead) => void;
}

function SortHead({
  label,
  col,
  sort,
  order,
  onSort,
}: {
  label: string;
  col: LeadFilters["sort"];
  sort: LeadFilters["sort"];
  order: LeadFilters["order"];
  onSort: (c: LeadFilters["sort"]) => void;
}) {
  const active = sort === col;
  return (
    <th className={`sortable ${active ? "active" : ""}`} onClick={() => onSort(col)}>
      {label} {active ? (order === "desc" ? "▼" : "▲") : ""}
    </th>
  );
}

export default function LeadsTable({
  leads,
  selected,
  onToggleSelect,
  onToggleAll,
  sort,
  order,
  onSort,
  onStatusChange,
  onOpen,
}: Props) {
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  return (
    <>
      <div className="mobile-only mobile-card-list">
        <label className="mobile-select-all">
          <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
          Select all on page
        </label>
        {leads.map((l) => {
          const googleTags = googleDataTags(l);
          return (
            <article key={l.id} className={`mobile-card${selected.has(l.id) ? " sel" : ""}`}>
              <div className="mobile-card-top">
                <label className="mobile-card-check">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => onToggleSelect(l.id)} />
                  <strong>{l.displayName}</strong>
                </label>
                <ScorePill value={l.priorityScore} />
              </div>
              <div className="mobile-card-meta">
                <span>
                  {l.town || "—"} · {l.phone ?? "No phone"}
                </span>
                <span>{l.email ?? "No email"}</span>
                <span>
                  {l.rating?.toFixed(1) ?? "—"}★ · {l.userRatingCount} reviews
                </span>
                <div className="google-tags">
                  <WebsiteClassBadge value={l.websiteClass} />
                  <DomainBadge value={l.domainAvailable} suggested={l.domainSuggested} />
                  {googleTags.slice(0, 3).map((tag) => (
                    <span key={tag} className="tag tag-google">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mobile-card-actions">
                <button type="button" className="primary" onClick={() => onOpen(l)}>
                  Open
                </button>
                <select
                  value={l.outreachStatus}
                  onChange={(e) => onStatusChange(l.id, e.target.value as OutreachStatus)}
                  aria-label={`Status for ${l.displayName}`}
                >
                  {OUTREACH_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          );
        })}
        {leads.length === 0 && <p className="hint">No leads match. Run a search or loosen the filters.</p>}
      </div>

      <div className="table-wrap desktop-only">
        <table className="leads-table">
          <thead>
            <tr>
              <th className="col-check">
                <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
              </th>
              <th className="col-business">Business</th>
              <th className="col-town">Town</th>
              <th className="col-phone">Phone</th>
              <th className="col-email">Email</th>
              <th className="col-google">Google data</th>
              <th className="col-website">Website</th>
              <SortHead label="Rating" col="rating" sort={sort} order={order} onSort={onSort} />
              <SortHead label="Reviews" col="userRatingCount" sort={sort} order={order} onSort={onSort} />
              <th className="col-domain">Domain</th>
              <SortHead label="Score" col="priorityScore" sort={sort} order={order} onSort={onSort} />
              <th className="col-status">Status</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const googleTags = googleDataTags(l);
              return (
                <tr key={l.id} className={selected.has(l.id) ? "sel" : ""}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => onToggleSelect(l.id)} />
                  </td>
                  <td className="col-business">
                    <button className="link" onClick={() => onOpen(l)}>
                      {l.displayName}
                    </button>
                    {l.phoneIsMobile && <span className="tag">mobile</span>}
                  </td>
                  <td className="col-town">{l.town || "—"}</td>
                  <td className="col-phone">{l.phone ?? "—"}</td>
                  <td className="col-email">{l.email ?? "—"}</td>
                  <td className="col-google">
                    <div className="google-tags">
                      {googleTags.map((tag) => (
                        <span key={tag} className="tag tag-google">
                          {tag}
                        </span>
                      ))}
                      {!googleTags.length && <span className="muted-text">Refresh to fetch</span>}
                    </div>
                  </td>
                  <td className="col-website">
                    <WebsiteClassBadge value={l.websiteClass} />
                  </td>
                  <td>{l.rating?.toFixed(1) ?? "—"}</td>
                  <td>{l.userRatingCount}</td>
                  <td className="col-domain">
                    <DomainBadge value={l.domainAvailable} suggested={l.domainSuggested} />
                  </td>
                  <td className="col-score">
                    <ScorePill value={l.priorityScore} />
                  </td>
                  <td className="col-status">
                    <select
                      value={l.outreachStatus}
                      onChange={(e) => onStatusChange(l.id, e.target.value as OutreachStatus)}
                    >
                      {OUTREACH_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={12} className="empty">
                  No leads match. Run a search or loosen the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
