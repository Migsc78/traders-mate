import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tradieApi, type QuoteDto } from "../../../api/tradie";
import { QueryError } from "../ui";

type PriceRow = {
  id: string;
  label: string;
  unit: string;
  unitPricePence: number;
  vatRate: number;
};

/**
 * Pick rates from the price book and append them to the draft quote.
 * Same search/select pattern as template add-items — works offline from cache.
 */
export default function QuoteAddItemsPage() {
  const { quoteId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Map<string, PriceRow>>(new Map());

  const book = useQuery({
    queryKey: ["tradie-price-book"],
    queryFn: () => tradieApi.priceBook(),
  });

  const quote = useQuery({
    queryKey: ["tradie-quote", quoteId],
    queryFn: () => tradieApi.getQuote(quoteId),
    enabled: !!quoteId,
  });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = (book.data || []) as PriceRow[];
    if (!needle) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(needle));
  }, [book.data, search]);

  const add = useMutation({
    mutationFn: async () => {
      const existing = (quote.data?.lines || []).filter((l) => l.label.trim());
      const vatRate = existing[0]?.vatRate ?? 20;
      const additions = [...picked.values()].map((r) => ({
        label: r.label,
        qty: 1,
        unit: (["EACH", "HOUR", "DAY", "JOB", "METRE"] as const).includes(
          r.unit as "EACH" | "HOUR" | "DAY" | "JOB" | "METRE"
        )
          ? r.unit
          : "JOB",
        unitPricePence: r.unitPricePence,
        vatRate: r.vatRate ?? vatRate,
        source: "BOOK",
      }));
      await sendOrQueue<QuoteDto>({
        label: `Add rates · ${quote.data?.reference || "quote"}`,
        path: `/quotes/${quoteId}/lines`,
        method: "PUT",
        body: {
          lines: [
            ...existing.map((l) => ({
              label: l.label.trim(),
              qty: Number(l.qty),
              unit: l.unit,
              unitPricePence: Number(l.unitPricePence),
              vatRate: Number(l.vatRate ?? vatRate),
              source: l.source,
            })),
            ...additions,
          ],
        },
        invalidates: ["tradie-quote", "tradie-quotes"],
      });
      await qc.invalidateQueries({ queryKey: ["tradie-quote", quoteId] });
    },
    onSuccess: () => navigate(`/t/quotes/${quoteId}/edit`, { replace: true, state: location.state }),
  });

  const toggle = (row: PriceRow) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.set(row.id, row);
      return next;
    });

  const selectedTotal = [...picked.values()].reduce((sum, r) => sum + r.unitPricePence, 0);
  const backToEdit = () => navigate(`/t/quotes/${quoteId}/edit`, { state: location.state });

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
        disabled={picked.size === 0 || add.isPending || quote.isLoading}
        onClick={() => add.mutate()}
      >
        {add.isPending ? "Adding…" : "Add selected items"}
      </button>

      <button type="button" className="t-btn t-btn--block" style={{ marginTop: 8 }} onClick={backToEdit}>
        Cancel
      </button>
    </div>
  );
}
