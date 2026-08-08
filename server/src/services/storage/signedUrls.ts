import { createHmac } from "node:crypto";
import path from "node:path";
import { env } from "../../env.js";
import { secretsEqual } from "../../lib/secureCompare.js";
import { UPLOADS_DIR } from "./paths.js";

const DEFAULT_TTL_SEC = 15 * 60; // 15 minutes
const PUBLIC_TTL_SEC = 60 * 60; // 1 hour for public token pages

function signingSecret(): string {
  return env.FILE_SIGNING_SECRET?.trim() || env.MAGIC_LINK_SECRET;
}

export function publicBase(): string {
  return env.PUBLIC_BASE_URL.replace(/\/$/, "");
}

/** Paths that must not be world-readable via express.static. */
export function isPrivateStorageKey(key: string): boolean {
  const k = key.replace(/^\/+/, "");
  return (
    k.startsWith("private/") ||
    k.startsWith("certs/") ||
    k.startsWith("pdfs/")
  );
}

/**
 * Extract storage key (relative to UPLOADS_DIR) from a stored URL or bare key.
 * Returns null for external URLs we don't own.
 */
export function storageKeyFromStored(urlOrKey: string): string | null {
  const raw = urlOrKey.trim();
  if (!raw) return null;

  // Already a relative key
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith("/")) {
    return raw.replace(/^\/+/, "");
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      const idx = u.pathname.indexOf("/uploads/");
      if (idx === -1) return null;
      return decodeURIComponent(u.pathname.slice(idx + "/uploads/".length).replace(/^\/+/, ""));
    }
  } catch {
    return null;
  }

  const m = raw.match(/\/uploads\/(.+)$/);
  if (m) return decodeURIComponent(m[1].replace(/^\/+/, ""));
  return null;
}

/** Absolute path on disk; rejects path traversal. */
export function resolveUploadPath(key: string): string {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
  if (!normalized || normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Invalid storage key");
  }
  const full = path.resolve(UPLOADS_DIR, normalized);
  const root = path.resolve(UPLOADS_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

function signPayload(key: string, exp: number): string {
  return createHmac("sha256", signingSecret()).update(`${key}.${exp}`).digest("base64url");
}

export function signFileUrl(key: string, ttlSec = DEFAULT_TTL_SEC): string {
  const clean = key.replace(/^\/+/, "");
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSec);
  const sig = signPayload(clean, exp);
  const q = new URLSearchParams({ exp: String(exp), sig });
  // Encode path segments but keep slashes as path separators
  const pathPart = clean
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
  return `${publicBase()}/api/files/${pathPart}?${q}`;
}

export function verifySignedFileRequest(key: string, expRaw: string, sig: string): boolean {
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  if (!key || !sig) return false;
  const expected = signPayload(key.replace(/^\/+/, ""), exp);
  return secretsEqual(sig, expected);
}

/**
 * Turn a DB-stored URL/key into something the client can fetch now.
 * Private objects get a short-lived signed URL; public stay permanent.
 */
export function toAccessUrl(
  urlOrKey: string | null | undefined,
  opts?: { ttlSec?: number; forPublicPage?: boolean }
): string | null {
  if (!urlOrKey) return null;
  const key = storageKeyFromStored(urlOrKey);
  if (!key) return urlOrKey; // external (e.g. placehold.co)
  if (!isPrivateStorageKey(key)) {
    return `${publicBase()}/uploads/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  const ttl = opts?.ttlSec ?? (opts?.forPublicPage ? PUBLIC_TTL_SEC : DEFAULT_TTL_SEC);
  return signFileUrl(key, ttl);
}

/** Map an object that may contain a `url` field. */
export function withAccessUrl<T extends { url?: string | null }>(
  row: T,
  opts?: { ttlSec?: number; forPublicPage?: boolean }
): T {
  if (!row?.url) return row;
  return { ...row, url: toAccessUrl(row.url, opts) ?? row.url };
}
