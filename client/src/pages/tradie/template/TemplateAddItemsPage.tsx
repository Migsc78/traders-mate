import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, tradieApi, type QuoteTemplateDetail } from "../../../api/tradie";
import { QueryError } from "../ui";
import { saveTemplate } from "../../../lib/newTemplate";

type PriceRow = {
  id: string;
  label: string;
  unit: string;
  unitPricePence: number;
  vatRate: number;
};

/**
 * Screen 4 — pick lines out of the price book.
 *
 * The price book is already cached for offline use, so this whole screen works
 * with no signal — which matters because building a template is the sort of thing
 * a tradie does in the van between jobs.
 */
export default function TemplateAddItemsPage() {
  const { templateId = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Map<string, PriceRow>>(new Map());

  const book = useQuery({
    queryKey: ["tradie-price-book"],
    queryFn: () => tradieApi.priceBook(),
  });

  const template = useQuery({
    queryKey: ["tradie-quote-template", templateId],
    queryFn: () => tradieApi.quoteTemplate(templateId),
    enabled: !!templateId,
  });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = (book.data || []) as PriceRow[];
    if (!needle) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(needle));
  }, [book.data, search]);

  const add = useMutation({
    mutationFn: async () => {
      const existing = template.data;
      const current = [
        ...(existing?.included || []).map((i) => ({ ...i, isAddOn: false })),
        ...(existing?.addOns || []).map((i) => ({ ...i, isAddOn: true })),
      ];
      const additions = [...picked.values()].map((r) => ({
        label: r.label,
        qty: 1,
        unit: r.unit,
        unitPricePence: r.unitPricePence,
        vatRate: r.vatRate ?? 20,
        isAddOn: false,
        priceBookItemId: r.id,
      }));
      await saveTemplate(qc, templateId, {
        name: existing?.name || "Template",
        items: [
          ...current.map((i) => ({
            label: i.label,
            qty: i.qty,
            unit: i.unit,
            unitPricePence: i.unitPricePence,
            vatRate: i.vatRate,
            isAddOn: i.isAddOn,
          })),
          ...additions,
        ],
      });
    },
    onSuccess: () => navigate(`/t/rates/templates/${templateId}/edit`, { replace: true }),
  });

  const toggle = (row: PriceRow) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });

  const selectedTotal = [...picked.values()].reduce((sum, r) => sum + r.unitPricePence, 0);

  return (
    <div className="t-add-items">
      <div className="t-search-wrap">
        <input
          className="t-search-input"
          type="search"
          placeholder="Search price book"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search price book"
        />
      </div>

      {book.isLoading && <p className="muted-text">Loading rates…</p>}
      <QueryError error={book.error} />

      <ul className="t-pick-list">
        {visible.map((r) => {
          const on = picked.has(r.id);
          return (
            <li key={r.id}>
              <label className="t-pick-row">
                <input type="checkbox" checked={on} onChange={() => toggle(r)} />
                <span className="t-pick-main">
                  <strong>{r.label}</strong>
                  <span className="muted-text">{r.unit}</span>
                </span>
                <span className="t-pick-price">{formatGbp(r.unitPricePence)}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {book.data && visible.length === 0 && (
        <p className="muted-text">No rates match &ldquo;{search}&rdquo;.</p>
      )}

      <QueryError error={add.error} />

      {picked.size > 0 && (
        <div className="t-pick-bar">
          <span>
            <strong>
              {picked.size} item{picked.size === 1 ? "" : "s"} selected
            </strong>
            <span className="muted-text">Total {formatGbp(selectedTotal)}</span>
          </span>
          <button type="button" onClick={() => setPicked(new Map())}>
            Clear
          </button>
        </div>
      )}

      <button
        type="button"
        className="primary t-btn--block"
        disabled={picked.size === 0 || add.isPending}
        onClick={() => add.mutate()}
      >
        {add.isPending ? "Adding…" : "Add selected items"}
      </button>

      <button
        type="button"
        className="t-btn t-btn--block"
        style={{ marginTop: 8 }}
        onClick={() => navigate(`/t/rates/templates/${templateId}/edit`)}
      >
        Skip for now
      </button>
    </div>
  );
}

export type { QuoteTemplateDetail };
