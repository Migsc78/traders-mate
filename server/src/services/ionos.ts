import { env } from "../env.js";
import { withRetry } from "../lib/limiter.js";

export type DomainState = "AVAILABLE" | "TAKEN" | "UNKNOWN";

/**
 * IONOS integration.
 *
 * Two very different things live here, and it matters which one you have:
 *
 *  1. AFFILIATE (CJ / Awin) — what the IONOS "affiliate program" actually is.
 *     You get a tracked referral link; you earn commission when someone registers
 *     through it. There is NO availability/registration API with an affiliate account.
 *     `affiliateLink()` builds that tracked link for a suggested domain.
 *
 *  2. RESELLER / DEVELOPER API — a separate account type with real API credentials
 *     (auth header "X-API-Key: <prefix>.<secret>"). Only this can check availability
 *     or register programmatically. `checkAvailability()` targets that API and is only
 *     used when DOMAIN_CHECK_PROVIDER=ionos. Absent credentials, it returns UNKNOWN.
 */

/** Build the "X-API-Key: <prefix>.<secret>" value from env, or null if not configured. */
export function ionosApiKeyHeader(): string | null {
  const key = env.IONOS_API_KEY.trim();
  const secret = env.IONOS_API_SECRET.trim();
  if (!key) return null;
  if (key.includes(".")) return key;
  if (secret) return `${key}.${secret}`;
  return key;
}

/**
 * Availability via the IONOS reseller/developer API. Best-effort: never throws,
 * returns UNKNOWN on any non-conclusive result. The exact path/response shape
 * varies by account, so parsing is defensive and the path is env-configurable.
 */
export async function checkAvailability(domain: string): Promise<DomainState> {
  const apiKey = ionosApiKeyHeader();
  if (!apiKey) return "UNKNOWN";

  const url = env.IONOS_API_BASE.replace(/\/$/, "") + env.IONOS_AVAILABILITY_PATH.replace("{domain}", encodeURIComponent(domain));

  try {
    const res = await withRetry(
      () =>
        fetch(url, {
          headers: { "X-API-Key": apiKey, Accept: "application/json" },
        }),
      { retries: 3, baseMs: 400, shouldRetry: (e) => e instanceof Error }
    );

    if (res.status === 401 || res.status === 403) {
      console.warn("[ionos] availability check unauthorised — check IONOS_API_KEY/SECRET");
      return "UNKNOWN";
    }
    if (!res.ok) return "UNKNOWN";

    const body: unknown = await res.json().catch(() => null);
    return interpretAvailability(body);
  } catch {
    return "UNKNOWN";
  }
}

/**
 * Map a variety of plausible IONOS response shapes onto our tri-state.
 * Kept permissive so a minor schema change doesn't silently break the check.
 */
export function interpretAvailability(body: unknown): DomainState {
  if (!body || typeof body !== "object") return "UNKNOWN";
  const b = body as Record<string, unknown>;

  // Common shapes: { available: true }, { status: "AVAILABLE" }, { data: [{ available: bool }] }
  const flat = (val: unknown): DomainState => {
    if (typeof val === "boolean") return val ? "AVAILABLE" : "TAKEN";
    if (typeof val === "string") {
      const s = val.toUpperCase();
      if (s.includes("AVAILABLE") || s === "FREE") return "AVAILABLE";
      if (s.includes("REGISTERED") || s.includes("TAKEN") || s.includes("UNAVAILABLE")) return "TAKEN";
    }
    return "UNKNOWN";
  };

  if ("available" in b) return flat(b.available);
  if ("status" in b) return flat(b.status);
  if (Array.isArray(b.data) && b.data.length) {
    const first = b.data[0] as Record<string, unknown>;
    if ("available" in first) return flat(first.available);
    if ("status" in first) return flat(first.status);
  }
  return "UNKNOWN";
}
