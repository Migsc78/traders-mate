import { env } from "../env.js";

export type ReachResult = { status: "OK" | "DEAD" | "AMBIGUOUS" };

/**
 * Check whether a PROPER website actually loads.
 * - 2xx/3xx  -> OK (stays PROPER)
 * - network error / timeout / 5xx / 404 -> DEAD (becomes PROPER_DEAD, a hot lead)
 * - 403 or other bot-block signals -> AMBIGUOUS (leave as PROPER, don't fake a lead)
 */
export async function checkReachable(url: string): Promise<ReachResult> {
  const target = url.includes("://") ? url : `https://${url}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.WEBSITE_CHECK_TIMEOUT_MS);

  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (res.status >= 200 && res.status < 400) return { status: "OK" };
    if (res.status === 403 || res.status === 401 || res.status === 429) return { status: "AMBIGUOUS" };
    return { status: "DEAD" };
  } catch (err) {
    const msg = (err as Error)?.name || "";
    // Abort/timeout could be a slow-but-alive site; treat as ambiguous rather than dead
    if (msg === "AbortError") return { status: "AMBIGUOUS" };
    return { status: "DEAD" };
  } finally {
    clearTimeout(timer);
  }
}
