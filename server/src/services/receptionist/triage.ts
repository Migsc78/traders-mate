export type EnquiryTriageTag = "LIKELY_JOB" | "QUOTE_SHOPPER" | "SPAM" | "UNKNOWN";

export type TriageFields = {
  triage: EnquiryTriageTag;
  summary: string;
  spam: boolean;
};

const SPAM_RE =
  /\b(ppi|life insurance|life cover|pension|guaranteed investment|investment opportunity|solar panel|marketing agency|business listing|google my business|directories|lead generation|seo package|website package|cold call|telemarketing)\b/i;

const QUOTE_SHOP_RE =
  /\b(just (want|looking for|after) (a )?quote|shopping around|cheapest|ballpark|rough (price|quote)|how much (would|do) you)\b/i;

export function detectSpamText(text: string): boolean {
  return SPAM_RE.test(text);
}

export function heuristicTriageFromText(text: string, opts?: { forceSpam?: boolean }): TriageFields {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (opts?.forceSpam || detectSpamText(cleaned)) {
    return {
      triage: "SPAM",
      spam: true,
      summary: summarizeSpam(cleaned),
    };
  }
  if (QUOTE_SHOP_RE.test(cleaned)) {
    return {
      triage: "QUOTE_SHOPPER",
      spam: false,
      summary: clip(cleaned || "Looking for a price / shopping around", 160),
    };
  }
  if (cleaned.length > 20) {
    return {
      triage: "LIKELY_JOB",
      spam: false,
      summary: clip(cleaned, 160),
    };
  }
  return {
    triage: "UNKNOWN",
    spam: false,
    summary: clip(cleaned || "Missed call — needs a look", 160),
  };
}

export function normalizeTriage(raw: unknown): EnquiryTriageTag {
  const v = String(raw || "").toUpperCase();
  if (v === "LIKELY_JOB" || v === "QUOTE_SHOPPER" || v === "SPAM" || v === "UNKNOWN") return v;
  return "UNKNOWN";
}

export function mergeModelTriage(opts: {
  spam?: boolean;
  triage?: unknown;
  summary?: unknown;
  message?: string | null;
  transcript?: string;
}): TriageFields {
  const baseText = String(opts.summary || opts.message || opts.transcript || "").trim();
  if (opts.spam || normalizeTriage(opts.triage) === "SPAM" || detectSpamText(baseText)) {
    return heuristicTriageFromText(baseText, { forceSpam: true });
  }
  const triage = normalizeTriage(opts.triage);
  if (triage === "UNKNOWN") {
    return heuristicTriageFromText(baseText);
  }
  return {
    triage,
    spam: false,
    summary: clip(String(opts.summary || opts.message || baseText || "New enquiry"), 160),
  };
}

function summarizeSpam(text: string): string {
  if (/life insurance|life cover/i.test(text)) return "Suspected life insurance / cover sales call";
  if (/ppi/i.test(text)) return "Suspected PPI / claims sales call";
  if (/solar/i.test(text)) return "Suspected solar sales call";
  if (/marketing agency|seo|website package|lead generation/i.test(text)) {
    return "Suspected marketing / lead-gen sales call";
  }
  if (/business listing|google my business|directories/i.test(text)) {
    return "Suspected business-listing sales call";
  }
  return clip(text || "Suspected spam / telesales", 160);
}

function clip(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

export function conversationSummaryText(
  turns: { role: string; text: string }[]
): string {
  return turns
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join(" ")
    .trim();
}
