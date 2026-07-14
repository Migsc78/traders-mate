import { getClaudeApiKey } from "../../settings.js";

/** Claude Haiku 4.5 — quote line extraction from job notes / transcript. */
export const CLAUDE_HAIKU_MODEL = "claude-haiku-4-5-20251001";

export interface ExtractedLine {
  label: string;
  qty: number;
  unit: "EACH" | "HOUR" | "DAY" | "JOB" | "METRE";
  skuHint?: string;
  notes?: string;
}

export interface ExtractResult {
  summary: string;
  callout: boolean;
  lines: ExtractedLine[];
  assumptions: string[];
}

const SYSTEM = `You extract UK trades job line items from a tradie's spoken or typed notes.
Return ONLY valid JSON matching this schema:
{"summary":string,"callout":boolean,"lines":[{"label":string,"qty":number,"unit":"EACH"|"HOUR"|"DAY"|"JOB"|"METRE","skuHint"?:string,"notes"?:string}],"assumptions":string[]}
Rules:
- Understand UK trade slang (combi, CU, TRV, first fix, second fix, rads, etc.).
- NEVER invent prices — only quantities and labels.
- Prefer skuHint from: CALL, LAB_HR, COMBI_SWAP, RAD_SWAP, TAP_FIT, TOILET, CU_UPG, SOCKET, EICR, LIGHT, SERVICE, TRV, POWERFLUSH when relevant.
- If a call-out / attendance fee is implied, set callout true and include a CALL line.
- Put uncertainty in assumptions[].
- If notes are empty or nonsense, return empty lines and say so in assumptions.`;

export async function extractJobLinesWithHaiku(transcript: string): Promise<ExtractResult> {
  const apiKey = getClaudeApiKey();
  if (!apiKey) throw new Error("Claude API key not configured — add it in Settings");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_HAIKU_MODEL,
      max_tokens: 1024,
      temperature: 0,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Job notes / transcript:\n\n${transcript.slice(0, 8000)}`,
        },
      ],
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    content?: { type: string; text?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `Claude API error ${res.status}`);
  }
  const text = json.content?.find((c) => c.type === "text")?.text || "";
  const parsed = parseJsonObject(text);
  return normalizeExtract(parsed);
}

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1].trim() : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Claude did not return JSON");
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizeExtract(raw: Record<string, unknown>): ExtractResult {
  const linesRaw = Array.isArray(raw.lines) ? raw.lines : [];
  const units = new Set(["EACH", "HOUR", "DAY", "JOB", "METRE"]);
  const lines: ExtractedLine[] = linesRaw
    .map((l) => {
      const row = l as Record<string, unknown>;
      const unit = String(row.unit || "JOB").toUpperCase();
      return {
        label: String(row.label || "").trim(),
        qty: Math.max(0.25, Number(row.qty) || 1),
        unit: (units.has(unit) ? unit : "JOB") as ExtractedLine["unit"],
        skuHint: row.skuHint ? String(row.skuHint) : undefined,
        notes: row.notes ? String(row.notes) : undefined,
      };
    })
    .filter((l) => l.label.length > 0);

  return {
    summary: String(raw.summary || "").trim() || "Job quote",
    callout: Boolean(raw.callout),
    lines,
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map((a) => String(a)) : [],
  };
}
