import { useState, type InputHTMLAttributes } from "react";

/**
 * Number fields that can actually be edited.
 *
 * The obvious approach — `value={(pence / 100).toFixed(2)}` — is unusable on a
 * phone: every keystroke re-derives the text from the stored integer, so pressing
 * backspace on "12.00" instantly writes "12.00" back and the field can never be
 * cleared. Half-typed states like "" or "1." have nowhere to live.
 *
 * These keep their own text while focused and only re-format on blur, so the
 * tradie can clear a rate and retype it. `type="text"` with `inputMode="decimal"`
 * rather than `type="number"`, which fights partial input on mobile keyboards.
 */

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">;

/** Strip anything that isn't a digit or dot, and keep at most `decimals` places. */
function sanitise(raw: string, decimals: number): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, decimals)}`;
}

function toNumber(text: string): number {
  if (text === "" || text === ".") return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

/** Money field backed by an integer pence value. */
export function MoneyInput({
  pence,
  onPence,
  ...rest
}: BaseProps & { pence: number; onPence: (pence: number) => void }) {
  // null means "not being edited" — show the canonical formatted value.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft ?? (Math.round(pence) / 100).toFixed(2)}
      onFocus={() => setDraft((Math.round(pence) / 100).toFixed(2))}
      onChange={(e) => {
        const text = sanitise(e.target.value, 2);
        setDraft(text);
        onPence(Math.round(toNumber(text) * 100));
      }}
      onBlur={() => setDraft(null)}
      {...rest}
    />
  );
}

/** Plain number field — quantities, VAT percentages. */
export function NumberInput({
  value,
  onValue,
  decimals = 2,
  max,
  ...rest
}: BaseProps & {
  value: number;
  onValue: (value: number) => void;
  decimals?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      type="text"
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={draft ?? String(value)}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        const text = sanitise(e.target.value, decimals);
        setDraft(text);
        const n = toNumber(text);
        onValue(max != null ? Math.min(max, n) : n);
      }}
      onBlur={() => setDraft(null)}
      {...rest}
    />
  );
}
