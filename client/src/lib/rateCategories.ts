/**
 * The five buckets the price book is grouped into on the Rates screen.
 *
 * Deliberately short: a category the tradie has to think about is a category
 * they'll pick wrong, and the whole point is finding a rate in a hurry.
 */
export const RATE_CATEGORIES = [
  { id: "SERVICE", label: "Services", hint: "Fixed-price service items" },
  { id: "MATERIAL", label: "Materials", hint: "Parts and products" },
  { id: "LABOUR", label: "Labour", hint: "Hourly or day rates" },
  { id: "CALLOUT", label: "Call-outs", hint: "Diagnostics and emergency visits" },
  { id: "OTHER", label: "Other", hint: "Miscellaneous items" },
] as const;

export type RateCategoryId = (typeof RATE_CATEGORIES)[number]["id"];

const BY_ID = new Map(RATE_CATEGORIES.map((c) => [c.id, c] as const));

/** Rates saved before categories existed, or imported without one, live in Other. */
export function categoryOf(row: { category?: string | null }): RateCategoryId {
  const raw = (row.category || "").toUpperCase() as RateCategoryId;
  return BY_ID.has(raw) ? raw : "OTHER";
}

export function categoryLabel(id: string | null | undefined): string {
  if (!id) return "Other";
  return BY_ID.get(id.toUpperCase() as RateCategoryId)?.label ?? "Other";
}

/**
 * Where a rate belongs when the tradie hasn't said.
 *
 * Only used to pre-select a radio button they can override, never to file
 * something silently — the guess is right often enough to save a tap and
 * visible enough to fix when it isn't.
 */
export function suggestCategory(row: { isCallout?: boolean; unit?: string }): RateCategoryId {
  if (row.isCallout) return "CALLOUT";
  if (row.unit === "HOUR" || row.unit === "DAY") return "LABOUR";
  return "SERVICE";
}
