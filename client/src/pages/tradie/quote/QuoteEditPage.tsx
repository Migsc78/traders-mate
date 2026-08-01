import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tradieApi, type QuoteDto, type QuoteLineDto } from "../../../api/tradie";
import { QueryError } from "../ui";
import { MoneyInput, NumberInput } from "../../../components/NumericInput";

const UNITS = ["JOB", "HOUR", "EACH", "DAY", "METRE"];

/**
 * Step 6 — the line items, with totals that move as you type.
 *
 * Totals are computed locally rather than round-tripping on every keystroke: the
 * tradie is often standing in front of the customer adjusting a price, and a
 * number that lags behind the typing reads as broken. The server recalculates on
 * save, which is what the customer's copy is built from.
 */
export default function QuoteEditPage() {
  const { quoteId = "" } = useParams();
  const navigate = useNavigate();
  const [lines, setLines] = useState<QuoteLineDto[] | null>(null);

  const quote = useQuery({
    queryKey: ["tradie-quote", quoteId],
    queryFn: () => tradieApi.getQuote(quoteId),
    enabled: !!quoteId,
  });

  useEffect(() => {
    if (quote.data && lines === null) setLines(quote.data.lines);
  }, [quote.data, lines]);

  const save = useMutation({
    mutationFn: () =>
      sendOrQueue<QuoteDto>({
        label: `Quote edits · ${quote.data?.reference || "quote"}`,
        path: `/quotes/${quoteId}/lines`,
        method: "PUT",
        body: {
          lines: (lines || []).map((l) => ({
            label: l.label,
            qty: Number(l.qty),
            unit: l.unit,
            unitPricePence: Number(l.unitPricePence),
            vatRate: Number(l.vatRate ?? 20),
          })),
        },
        invalidates: ["tradie-quote", "tradie-quotes"],
      }),
    onSuccess: () => navigate(`/t/quotes/${quoteId}/terms`),
  });

  if (quote.isLoading || lines === null) return <p className="muted-text">Loading quote…</p>;
  if (!quote.data) return <QueryError error={quote.error} />;

  const update = (i: number, patch: Partial<QuoteLineDto>) =>
    setLines((prev) => (prev || []).map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const subtotal = lines.reduce((sum, l) => sum + l.unitPricePence * Number(l.qty || 0), 0);
  const vat = lines.reduce(
    (sum, l) => sum + (l.unitPricePence * Number(l.qty || 0) * Number(l.vatRate ?? 20)) / 100,
    0
  );

  return (
    <div className="t-quote-edit">
      <div className="t-lines-head">
        <span>Item</span>
        <span>Qty</span>
        <span>Unit</span>
        <span>Total</span>
      </div>

      <ul className="t-lines">
        {lines.map((l, i) => (
          <li key={l.id || i}>
            <input
              className="t-line-label"
              value={l.label}
              placeholder="Describe the item"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <div className="t-line-fields">
              <NumberInput
                aria-label="Quantity"
                value={l.qty}
                onValue={(qty) => update(i, { qty })}
              />
              <select value={l.unit} onChange={(e) => update(i, { unit: e.target.value })} aria-label="Unit">
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <MoneyInput
                aria-label="Unit price"
                pence={l.unitPricePence}
                onPence={(unitPricePence) => update(i, { unitPricePence })}
              />
              <span className="t-line-total">{formatGbp(l.unitPricePence * Number(l.qty || 0))}</span>
              <button
                type="button"
                className="t-line-remove"
                aria-label={`Remove ${l.label || "line"}`}
                onClick={() => setLines((prev) => (prev || []).filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="t-btn"
        onClick={() =>
          setLines((prev) => [
            ...(prev || []),
            { label: "", qty: 1, unit: "JOB", unitPricePence: 0, vatRate: 20, source: "MANUAL" } as QuoteLineDto,
          ])
        }
      >
        + Add item
      </button>

      <div className="t-totals">
        <p>
          <span>Subtotal</span>
          <span>{formatGbp(Math.round(subtotal))}</span>
        </p>
        <p>
          <span>VAT</span>
          <span>{formatGbp(Math.round(vat))}</span>
        </p>
        <p className="t-totals-grand">
          <span>Total</span>
          <span>{formatGbp(Math.round(subtotal + vat))}</span>
        </p>
      </div>

      <QueryError error={save.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={save.isPending || lines.length === 0}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Next: Deposit & terms"}
      </button>
    </div>
  );
}
