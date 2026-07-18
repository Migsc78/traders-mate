import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";
import { isProduction } from "../lib/production.js";

/**
 * Twilio request signature (HMAC-SHA1) over full URL + sorted POST params.
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
export function twilioSignatureValid(opts: {
  authToken: string;
  signature: string;
  url: string;
  params: Record<string, unknown>;
}): boolean {
  const { authToken, signature, url } = opts;
  if (!authToken || !signature) return false;

  let data = url;
  const keys = Object.keys(opts.params).sort();
  for (const key of keys) {
    const raw = opts.params[key];
    const value = Array.isArray(raw) ? raw.join("") : raw == null ? "" : String(raw);
    data += key + value;
  }

  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Candidate URLs Twilio may have signed (PUBLIC_BASE_URL and proxied host). */
function webhookUrlCandidates(req: Request): string[] {
  const path = req.originalUrl || req.url || "";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const urls = new Set<string>();
  urls.add(`${env.PUBLIC_BASE_URL.replace(/\/$/, "")}${normalizedPath}`);

  const proto =
    String(req.headers["x-forwarded-proto"] || "")
      .split(",")[0]
      ?.trim() || req.protocol;
  const host =
    String(req.headers["x-forwarded-host"] || "")
      .split(",")[0]
      ?.trim() || req.get("host") || "";
  if (host && (proto === "http" || proto === "https")) {
    urls.add(`${proto}://${host}${normalizedPath}`);
  }
  return [...urls];
}

/**
 * Protect Twilio voice/SMS webhooks.
 * - Auth token set → require valid X-Twilio-Signature (prod + local).
 * - Auth token missing → allow only outside production (dev stubs).
 */
export function requireTwilioSignature(req: Request, res: Response, next: NextFunction) {
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() || "";
  const signature = String(req.headers["x-twilio-signature"] || "");
  const urls = webhookUrlCandidates(req);
  const params = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

  if (!authToken) {
    if (isProduction()) {
      console.error("[twilio] TWILIO_AUTH_TOKEN missing in production — rejecting webhook");
      res.status(503).type("text/plain").send("Twilio not configured");
      return;
    }
    console.warn("[twilio] TWILIO_AUTH_TOKEN unset — skipping signature check (dev only)");
    next();
    return;
  }

  const ok = urls.some((url) => twilioSignatureValid({ authToken, signature, url, params }));
  if (!ok) {
    console.warn("[twilio] invalid signature", { path: req.path });
    res.status(403).type("text/plain").send("Invalid Twilio signature");
    return;
  }
  next();
}
