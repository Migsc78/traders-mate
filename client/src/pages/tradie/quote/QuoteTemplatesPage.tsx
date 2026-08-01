import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { tradieApi } from "../../../api/tradie";
import { EmptyState, IconChevron, QueryError } from "../ui";

/** Step 2 — find the right template fast: search plus category chips. */
export default function QuoteTemplatesPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");

  const templates = useQuery({
    queryKey: ["tradie-quote-templates"],
    queryFn: () => tradieApi.quoteTemplates(),
  });

  // Chips come from what the tradie actually has, not a fixed list — otherwise an
  // electrician sees "Bathrooms" and a plumber never sees their own categories.
  const categories = useMemo(() => {
    const found = new Set<string>();
    for (const t of templates.data || []) if (t.category) found.add(t.category);
    return ["All", ...[...found].sort()];
  }, [templates.data]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (templates.data || []).filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (!needle) return true;
      return (
        t.name.toLowerCase().includes(needle) ||
        (t.description || "").toLowerCase().includes(needle)
      );
    });
  }, [templates.data, search, category]);

  return (
    <div>
      <div className="t-search-wrap">
        <input
          className="t-search-input"
          type="search"
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search templates"
        />
      </div>

      {categories.length > 2 && (
        <div className="t-chip-row" role="tablist" aria-label="Template categories">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={category === c}
              className={`t-chip${category === c ? " is-active" : ""}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {templates.isLoading && <p className="muted-text">Loading templates…</p>}
      <QueryError error={templates.error} />

      <ul className="t-list">
        {visible.map((t) => (
          <li key={t.id}>
            <Link className="t-row" to={`/t/quotes/new/templates/${t.id}`}>
              <div className="t-row-main">
                <strong>{t.name}</strong>
                <span className="t-row-sub">
                  {t.itemCount} item{t.itemCount === 1 ? "" : "s"}
                  {t.addOnCount > 0 ? ` · ${t.addOnCount} add-on${t.addOnCount === 1 ? "" : "s"}` : ""}
                </span>
              </div>
              <div className="t-row-side">
                <IconChevron />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {templates.data && visible.length === 0 && (
        <EmptyState
          title="No templates match"
          hint={search ? "Try a different search or category." : "Templates are seeded from your trade."}
        />
      )}
    </div>
  );
}
