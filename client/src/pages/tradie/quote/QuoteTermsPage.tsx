import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatGbp, sendOrQueue, tradieApi } from "../../../api/tradie";
import { QueryError } from "../ui";

const VALID_OPTIONS = [7, 14, 30, 60, 90];
const DURATIONS = ["Half a day", "1 day", "2–3 days", "About a week", "2 weeks +"];

/**
 * Step 7 — deposit, how long it stands, and roughly when you can start.
 *
 * Deposit is entered as a percentage of the quote total (matching Settings →
 * default deposit). Terms prefill from Settings → default quote terms when the
 * quote doesn't already have its own. Both can still be edited per quote.
 */
export default function QuoteTermsPage() {
  const { quoteId = "" } = useParams();
  const navigate = useNavigate();

  const quote = useQuery({
    queryKey: ["tradie-quote", quoteId],
    queryFn: () => tradieApi.getQuote(quoteId),
    enabled: !!quoteId,
  });

  const me = useQuery({
    queryKey: ["tradie-me"],
    queryFn: () => tradieApi.me(),
  });

  const [depositPercent, setDepositPercent] = useState(0);
  const [validDays, setValidDays] = useState(30);
  const [startDate, setStartDate] = useState("");
  const [duration, setDuration] = useState("");
  const [terms, setTerms] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (!quote.data || !me.data || seeded) return;
    setSeeded(true);
    const q = quote.data;
    // Prefer a percent already saved on this quote; otherwise the settings default.
    const fromQuote = typeof q.depositPercent === "number" && q.depositPercent > 0;
    setDepositPercent(fromQuote ? q.depositPercent : me.data.defaultDepositPercent || 0);
    setValidDays(q.validDays || 30);
    setStartDate(q.earliestStartAt ? q.earliestStartAt.slice(0, 10) : "");
    setDuration(q.estimatedDuration || "");
    setTerms(q.termsNote?.trim() ? q.termsNote : me.data.defaultTermsNote || "");
  }, [quote.data, me.data, seeded]);

  const save = useMutation({
    mutationFn: () =>
      sendOrQueue({
        label: "Quote terms",
        path: `/quotes/${quoteId}/terms`,
        method: "PATCH",
        body: {
          depositPercent,
          validDays,
          earliestStartAt: startDate ? new Date(startDate).toISOString() : null,
          estimatedDuration: duration || null,
          termsNote: terms.trim() || null,
        },
        invalidates: ["tradie-quote", "tradie-quotes"],
      }),
    onSuccess: () => navigate(`/t/quotes/${quoteId}/preview`),
  });

  if (quote.isLoading || me.isLoading) return <p className="muted-text">Loading…</p>;
  if (!quote.data) return <QueryError error={quote.error} />;

  const total = quote.data.totalPence;
  const depositPence = depositPercent > 0 ? Math.round((total * depositPercent) / 100) : 0;

  return (
    <div className="t-quote-terms">
      <p className="t-section-label">Deposit</p>
      <div className="t-card">
        <label className="t-field">
          Deposit (%)
          <div className="t-deposit-row">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-label="Deposit percentage"
              value={depositPercent === 0 ? "" : String(depositPercent)}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                if (raw === "") {
                  setDepositPercent(0);
                  return;
                }
                const n = Math.min(100, Math.max(0, parseInt(raw, 10)));
                setDepositPercent(Number.isFinite(n) ? n : 0);
              }}
            />
            <span className="t-deposit-pct" title="Calculated from quote total">
              {formatGbp(depositPence)}
            </span>
          </div>
        </label>
        <p className="muted-text">
          {depositPercent > 0
            ? `${depositPercent}% of ${formatGbp(total)} — deducted from the final balance.`
            : "Deposit will be deducted from the final balance."}
        </p>
      </div>

      <p className="t-section-label">Validity</p>
      <div className="t-card">
        <label className="t-field">
          Quote valid for
          <select value={validDays} onChange={(e) => setValidDays(Number(e.target.value))}>
            {VALID_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="t-section-label">Availability</p>
      <div className="t-card">
        <label className="t-field">
          Earliest start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="t-field">
          Estimated duration
          <select value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option value="">Not specified</option>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="t-section-label">Terms &amp; notes (optional)</p>
      <div className="t-card">
        <textarea
          rows={3}
          placeholder="Payment on completion unless otherwise agreed."
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
        />
      </div>

      <p className="t-terms-total">
        <span>Quote total</span>
        <strong>{formatGbp(total)}</strong>
      </p>

      <QueryError error={save.error} />

      <button
        type="button"
        className="primary t-btn--block"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Next: Preview"}
      </button>
    </div>
  );
}
