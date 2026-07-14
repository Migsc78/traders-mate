import { randomBytes } from "node:crypto";

// Public, non-secret identifier baked into a client's site/widget.
// Only names a tenant; grants no access.
export function generateRouteKey(): string {
  return "tm_" + randomBytes(4).toString("hex"); // e.g. tm_a4f9c2e1
}

export function isRouteKey(v: string): boolean {
  return /^tm_[0-9a-f]{8}$/.test(v);
}
