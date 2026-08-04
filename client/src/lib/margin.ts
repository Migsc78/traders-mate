/**
 * Margin on a single rate, for the Rates screen.
 *
 * Deliberately returns null rather than a number when there's no cost recorded.
 * Every caller then has to decide what to show, which is the point: the one
 * thing this must never do is render 100% because nobody filled the cost in.
 */
export function marginPct(sellPence: number, costPence: number | null | undefined): number | null {
  if (costPence == null) return null;
  if (sellPence <= 0) return null;
  return Math.round(((sellPence - costPence) / sellPence) * 1000) / 10;
}

/** "42.2% margin" / "£30 loss" / null when there's nothing honest to say. */
export function marginLabel(sellPence: number, costPence: number | null | undefined): string | null {
  const pct = marginPct(sellPence, costPence);
  if (pct === null) return null;
  const profit = sellPence - (costPence ?? 0);
  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    Math.abs(profit) / 100
  );
  return profit < 0 ? `${money} loss` : `${money} · ${pct}% margin`;
}

/** Below this and it's worth a second look before quoting it again. */
export function marginTone(sellPence: number, costPence: number | null | undefined): "" | "thin" | "loss" {
  const pct = marginPct(sellPence, costPence);
  if (pct === null) return "";
  if (pct < 0) return "loss";
  return pct < 15 ? "thin" : "";
}
