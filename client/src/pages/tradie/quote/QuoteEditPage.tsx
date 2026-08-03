import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tradieApi, type QuoteDto, type QuoteLineDto } from "../../../api/tradie";
import { QueryError } from "../ui";
import { MoneyInput } from "../../../components/NumericInput";

const VAT_RATES = [0, 5, 20];

function qtyStep(unit: string): number {
  return unit === "HOUR" ? 0.5 : 1;
}

function roundQty(n: number, step: number): number {
  const rounded = Math.round(n / step) * step;
  return Math.max(step, Number(rounded.toFixed(2)));
}

/**
 * Step 6 — line items, compact like the wireframe: name · qty · total.
 *
 * Totals are computed locally rather than round-tripping on every keystroke: the
 * tradie is often standing in front of the customer adjusting a price, and a
 * number that lags behind the typing reads as broken. The server recalculates on
 * save, which is what the customer's copy is built from.
 */
export default function QuoteEditPage() {
  const { quoteId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [lines, setLines] = useState<QuoteLineDto[] | null>(null);
  const [vatRate, setVatRate] = useState(20);

  const quote = useQuery({
    queryKey: ["tradie-quote", quoteId],
    queryFn: () => tradieApi.getQuote(quoteId),
    enabled: !!quoteId,
  });

  useEffect(() => {
    if (!quote.data || lines !== null) return;
    setLines(quote.data.lines);
    const firstVat = quote.data.lines[0]?.vatRate;
    if (typeof firstVat === "number") setVatRate(firstVat);
  }, [quote.data, lines]);

  const payloadLines = (rows: QuoteLineDto[]) =>
    rows
      .filter((l) => l.label.trim())
      .map((l) => ({
        label: l.label.trim(),
        qty: Number(l.qty) || 1,
        unit: l.unit,
        unitPricePence: Number(l.unitPricePence),
        vatRate: Number(vatRate),
        source: l.source,
      }));

  const save = useMutation({
    mutationFn: () =>
      sendOrQueue<QuoteDto>({
        label: `Quote edits · ${quote.data?.reference || "quote"}`,
        path: `/quotes/${quoteId}/lines`,
        method: "PUT",
        body: { lines: payloadLines(lines || []) },
        invalidates: ["tradie-quote", "tradie-quotes"],
      }),
    onSuccess: () => navigate(`/t/quotes/${quoteId}/terms`, { state: location.state }),
  });

  const persistThenAdd = useMutation({
    mutationFn: async () => {
      const body = { lines: payloadLines(lines || []) };
      if (body.lines.length > 0) {
        await sendOrQueue<QuoteDto>({
          label: `Quote edits · ${quote.data?.reference || "quote"}`,
          path: `/quotes/${quoteId}/lines`,
          method: "PUT",
          body,
          invalidates: ["tradie-quote", "tradie-quotes"],
        });
        await qc.invalidateQueries({ queryKey: ["tradie-quote", quoteId] });
      }
    },
    onSuccess: () =>
      navigate(`/t/quotes/${quoteId}/items`, { state: location.state }),
  });

  if (quote.isLoading || lines === null) return <p className="muted-text">Loading quote…</p>;
  if (!quote.data) return <QueryError error={quote.error} />;

  const update = (i: number, patch: Partial<QuoteLineDto>) =>
    setLines((prev) => (prev || []).map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const bumpQty = (i: number, dir: -1 | 1) => {
    const line = lines[i];
    if (!line) return;
    const step = qtyStep(line.unit);
    update(i, { qty: roundQty(Number(line.qty || 0) + dir * step, step) });
  };

  const subtotal = lines.reduce((sum, l) => sum + l.unitPricePence * Number(l.qty || 0), 0);
  const vat = Math.round((subtotal * vatRate) / 100);

  return (
    <div className="t-quote-edit">
      <p className="t-section-label">Items</p>
      <ul className="t-quote-lines">
        {lines.map((l, i) => {
          const lineTotal = Math.round(l.unitPricePence * Number(l.qty || 0));
          return (
            <li key={l.id || i} className="t-quote-line">
              <input
                className="t-quote-line-label"
                value={l.label}
                placeholder="Item"
                aria-label="Item name"
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <div className="t-qty-stepper" role="group" aria-label={`Quantity for ${l.label || "item"}`}>
                <button type="button" aria-label="Decrease quantity" onClick={() => bumpQty(i, -1)}>
                  −
                </button>
                <span className="t-qty-stepper-value">{l.qty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => bumpQty(i, 1)}>
                  +
                </button>
              </div>
              <MoneyInput
                className="t-quote-line-price"
                aria-label={`Price for ${l.label || "item"}`}
                pence={lineTotal}
                onPence={(totalPence) => {
                  const qty = Number(l.qty) || 1;
                  update(i, { unitPricePence: Math.round(totalPence / qty) });
                }}
              />
              <button
                type="button"
                className="t-line-remove"
                aria-label={`Remove ${l.label || "line"}`}
                onClick={() => setLines((prev) => (prev || []).filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      {lines.length === 0 && <p className="muted-text">No items yet — add from your rates.</p>}

      <button
        type="button"
        className="t-btn"
        disabled={persistThenAdd.isPending}
        onClick={() => persistThenAdd.mutate()}
      >
        {persistThenAdd.isPending ? "Opening…" : "+ Add item"}
      </button>

      <div className="t-totals">
        <p>
          <span>Subtotal</span>
          <span>{formatGbp(Math.round(subtotal))}</span>
        </p>
        <p className="t-totals-vat">
          <span className="t-totals-vat-label">
            VAT
            <select
              aria-label="VAT rate"
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
            >
              {VAT_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </select>
          </span>
          <span>{formatGbp(vat)}</span>
        </p>
        <p className="t-totals-grand">
          <span>Total</span>
          <span>{formatGbp(Math.round(subtotal) + vat)}</span>
        </p>
      </div>

      <QueryError error={save.error || persistThenAdd.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={save.isPending || lines.filter((l) => l.label.trim()).length === 0}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Continue"}
      </button>
    </div>
  );
}
