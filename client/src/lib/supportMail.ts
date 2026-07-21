/** Public contact (prospects / general). */
export const INFO_EMAIL = "info@tradiesmate.co.uk";

/** Customer support inbox — for trial/active accounts only. */
export const SUPPORT_EMAIL = "support@tradiesmate.co.uk";

type SupportMailOpts = {
  businessName?: string | null;
  routeKey?: string | null;
};

/** Prefills subject/body so inbound mail is easy to triage as a ticket. */
export function supportMailto(opts: SupportMailOpts = {}): string {
  const bits = [
    opts.businessName?.trim() || null,
    opts.routeKey ? `route ${opts.routeKey}` : null,
  ].filter(Boolean);
  const who = bits.length ? ` — ${bits.join(", ")}` : "";
  const subject = `TradiesMate support${who}`;
  const body = [
    "Hi TradiesMate support,",
    "",
    "What I need help with:",
    "",
    "",
    "—",
    opts.businessName ? `Business: ${opts.businessName}` : null,
    opts.routeKey ? `Route key: ${opts.routeKey}` : null,
  ]
    .filter((line) => line != null)
    .join("\n");

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
