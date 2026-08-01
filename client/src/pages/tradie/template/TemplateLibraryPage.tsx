import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sendOrQueue, tradieApi, type QuoteTemplateSummary } from "../../../api/tradie";
import { EmptyState, QueryError } from "../ui";
import { newOutboxId } from "../../../lib/outbox";

function agoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 7) return `Updated ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `Updated ${weeks} week${weeks === 1 ? "" : "s"} ago`;
  return `Updated ${new Date(iso).toLocaleDateString("en-GB")}`;
}

/** Screen 2 — manage saved templates: search, duplicate, delete, create. */
export default function TemplateLibraryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [menuFor, setMenuFor] = useState<QuoteTemplateSummary | null>(null);

  const templates = useQuery({
    queryKey: ["tradie-quote-templates"],
    queryFn: () => tradieApi.quoteTemplates(),
  });

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
      return t.name.toLowerCase().includes(needle) || (t.description || "").toLowerCase().includes(needle);
    });
  }, [templates.data, search, category]);

  const duplicate = useMutation({
    mutationFn: (t: QuoteTemplateSummary) => {
      const id = newOutboxId();
      return sendOrQueue({
        label: `Duplicate template · ${t.name}`,
        path: `/templates/${t.id}/duplicate`,
        method: "POST",
        body: { id },
        invalidates: ["tradie-quote-templates"],
      }).then(() => id);
    },
    onSuccess: () => {
      setMenuFor(null);
      void qc.invalidateQueries({ queryKey: ["tradie-quote-templates"] });
    },
  });

  const remove = useMutation({
    mutationFn: (t: QuoteTemplateSummary) =>
      sendOrQueue({
        label: `Delete template · ${t.name}`,
        path: `/templates/${t.id}`,
        method: "DELETE",
        body: {},
        invalidates: ["tradie-quote-templates"],
      }),
    // Drop it from the list now — the row shouldn't linger waiting on a round trip.
    onMutate: (t) => {
      setMenuFor(null);
      qc.setQueryData<QuoteTemplateSummary[]>(["tradie-quote-templates"], (rows) =>
        (rows || []).filter((r) => r.id !== t.id)
      );
    },
  });

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
          <li key={t.id} className="t-tpl-row">
            <Link className="t-row" to={`/t/rates/templates/${t.id}/edit`}>
              <div className="t-row-main">
                <strong>{t.name}</strong>
                <span className="t-row-sub">
                  {[t.category, ...t.tags].filter(Boolean).join(" · ") || "Uncategorised"}
                </span>
                <span className="t-row-sub">
                  {t.itemCount} item{t.itemCount === 1 ? "" : "s"} · {agoLabel(t.updatedAt)}
                </span>
              </div>
            </Link>
            <div className="t-tpl-actions">
              <button
                type="button"
                aria-label={`Duplicate ${t.name}`}
                disabled={duplicate.isPending}
                onClick={() => duplicate.mutate(t)}
              >
                <IconCopy />
              </button>
              <button type="button" aria-label={`More options for ${t.name}`} onClick={() => setMenuFor(t)}>
                ⋮
              </button>
            </div>
          </li>
        ))}
      </ul>

      {templates.data && visible.length === 0 && (
        <EmptyState
          title={search || category !== "All" ? "No templates match" : "No templates yet"}
          hint="Build one from your price book and reuse it on every similar job."
        />
      )}

      <QueryError error={duplicate.error || remove.error} />

      <button
        type="button"
        className="primary t-btn--block"
        onClick={() => navigate("/t/rates/templates/new")}
      >
        + Create template
      </button>

      {menuFor && (
        <div className="t-more-root" role="presentation" onClick={() => setMenuFor(null)}>
          <div
            className="t-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={menuFor.name}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="t-more-handle" aria-hidden="true" />
            <p className="t-more-title">{menuFor.name}</p>
            <div className="tradie-actions" style={{ flexDirection: "column", gap: 8 }}>
              <Link className="t-btn t-btn--block" to={`/t/rates/templates/${menuFor.id}/edit`}>
                Edit template
              </Link>
              <button
                type="button"
                className="t-btn t-btn--block"
                disabled={duplicate.isPending}
                onClick={() => duplicate.mutate(menuFor)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="danger t-btn--block"
                onClick={() => {
                  if (window.confirm(`Delete "${menuFor.name}"? Quotes already built from it keep their lines.`)) {
                    remove.mutate(menuFor);
                  }
                }}
              >
                Delete
              </button>
              <button type="button" className="t-btn t-btn--block" onClick={() => setMenuFor(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IconCopy() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
