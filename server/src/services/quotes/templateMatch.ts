/**
 * Folding a matched template into what the model heard in the notes.
 *
 * Split out from the drafting pipeline because this is the part worth testing:
 * the model call needs an API key and costs money, but the merge is pure, and
 * it's where the damage would be. Get it wrong and a tradie either loses lines
 * they dictated or gets a quote padded with extras the customer never asked for.
 */

export type TemplateLine = {
  label: string;
  qty: number;
  unit: string;
  unitPricePence: number;
  vatRate: number;
};

export type HeardLine = {
  label: string;
  qty: number;
  unit: string;
};

/**
 * Filler only. Words like "install", "service" and "replace" are deliberately NOT
 * here: they're the entire difference between a boiler service and a boiler
 * installation, and treating them as noise once made those two labels match —
 * which would quote a £1,700 install to someone who asked for a £90 service.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "with", "new", "old",
  "job", "work", "customer", "please", "also", "some",
]);

/** Abbreviations a tradie actually says out loud. */
const ALIASES: Record<string, string> = {
  mag: "magnetic",
  cu: "consumer",
  rad: "radiator",
  rads: "radiator",
  trv: "thermostatic",
  trvs: "thermostatic",
  stat: "thermostat",
};

/**
 * Crude 5-character stem, so "removal"/"remove" and "magnetic"/"magnet" line up.
 * A real stemmer is overkill for labels this short and would need a dependency.
 */
function stem(token: string): string {
  return token.slice(0, 5);
}

/** Lowercase alphanumeric tokens, minus filler, expanded and stemmed. */
function tokens(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => stem(ALIASES[t] ?? t));
}

/**
 * Do these two line labels describe the same thing?
 *
 * Loose enough that "mag filter" finds "Magnetic filter" — being too strict puts
 * the same item on the quote twice, which looks sloppy in front of a customer.
 * But two multi-word labels must share at least two meaningful words, so jobs
 * that differ by a single decisive word stay apart.
 */
export function labelsMatch(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;

  const na = ta.join(" ");
  const nb = tb.join(" ");
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const setA = new Set(ta);
  const shared = tb.filter((t) => setA.has(t)).length;
  // One word in common is only enough when one label is a single word.
  const required = Math.min(2, Math.min(setA.size, tb.length));
  return shared >= required;
}

export type MergeResult<H extends HeardLine = HeardLine> = {
  /** Template lines to price the quote from, in template order. */
  lines: TemplateLine[];
  /** Add-ons pulled in because the notes asked for them. */
  includedAddOns: TemplateLine[];
  /**
   * Heard lines the template doesn't cover — these still need the price book.
   * Generic so the caller's richer line type (skuHint and so on) survives.
   */
  extras: H[];
};

/**
 * Combine a matched template with what the tradie actually said.
 *
 * Included lines always come through: that's the scope of the standard job.
 * Add-ons only come through when the notes mention them — they're opt-in by
 * definition, so quietly adding a £150 thermostat nobody asked for would be
 * worse than leaving it off. Anything heard that the template doesn't cover
 * falls through to the normal price-book matching.
 */
export function mergeTemplateWithHeard<H extends HeardLine>(
  template: { included: TemplateLine[]; addOns: TemplateLine[] },
  heard: H[]
): MergeResult<H> {
  const includedAddOns = template.addOns.filter((addOn) =>
    heard.some((h) => labelsMatch(h.label, addOn.label))
  );

  // Quantities the tradie stated win over the template default — "2 rads" means
  // two, whatever the template says.
  const withHeardQty = (line: TemplateLine): TemplateLine => {
    const match = heard.find((h) => labelsMatch(h.label, line.label));
    return match && match.qty > 0 ? { ...line, qty: match.qty } : line;
  };

  const covered = [...template.included, ...includedAddOns];
  const extras = heard.filter((h) => !covered.some((c) => labelsMatch(h.label, c.label)));

  return {
    lines: [...template.included.map(withHeardQty), ...includedAddOns.map(withHeardQty)],
    includedAddOns,
    extras,
  };
}
