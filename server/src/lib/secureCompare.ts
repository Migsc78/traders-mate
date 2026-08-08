import { timingSafeEqual } from "node:crypto";

/** Constant-time equality for UTF-8 secrets (length mismatch → false). */
export function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
