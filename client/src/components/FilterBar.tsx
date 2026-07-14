import type { LeadFilters, WebsiteClass } from "../types";
import { WEBSITE_CLASSES, OUTREACH_STATUSES } from "../types";

interface Props {
  filters: LeadFilters;
  onChange: (patch: Partial<LeadFilters>) => void;
}

const CLASS_LABEL: Record<WebsiteClass, string> = {
  NONE: "No website",
  SOCIAL_ONLY: "Social only",
  DIRECTORY_ONLY: "Directory only",
  PROPER_DEAD: "Dead site",
  PROPER: "Has website",
};

export default function FilterBar({ filters, onChange }: Props) {
  const toggleClass = (c: WebsiteClass) => {
    const set = new Set(filters.websiteClass);
    set.has(c) ? set.delete(c) : set.add(c);
    onChange({ websiteClass: Array.from(set), page: 1 });
  };

  return (
    <div className="card filters">
      <div className="filter-group">
        <span className="filter-label">Website</span>
        <div className="chips">
          {WEBSITE_CLASSES.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${filters.websiteClass.includes(c) ? "on" : ""}`}
              onClick={() => toggleClass(c)}
            >
              {CLASS_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <label>
          Min reviews
          <input
            type="number"
            min={0}
            value={filters.minReviews ?? ""}
            onChange={(e) => onChange({ minReviews: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
          />
        </label>
        <label>
          Min rating
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            value={filters.minRating ?? ""}
            onChange={(e) => onChange({ minRating: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
          />
        </label>
        <label>
          Min score
          <input
            type="number"
            min={0}
            max={100}
            value={filters.minScore ?? ""}
            onChange={(e) => onChange({ minScore: e.target.value ? Number(e.target.value) : undefined, page: 1 })}
          />
        </label>
        <label>
          Occupation
          <input value={filters.occupation ?? ""} onChange={(e) => onChange({ occupation: e.target.value, page: 1 })} />
        </label>
        <label>
          Town
          <input value={filters.town ?? ""} onChange={(e) => onChange({ town: e.target.value, page: 1 })} />
        </label>
        <label>
          Status
          <select value={filters.status ?? ""} onChange={(e) => onChange({ status: e.target.value as LeadFilters["status"], page: 1 })}>
            <option value="">Any</option>
            {OUTREACH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={filters.qualified}
            onChange={(e) => onChange({ qualified: e.target.checked, page: 1 })}
          />
          Qualified only
        </label>
      </div>
    </div>
  );
}
