import { Capacitor } from "@capacitor/core";

/** True only inside the Capacitor iOS/Android shell — never in desktop/mobile browsers. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Paths that belong in the tradie shell. Everything else redirects into /t. */
export function isTradiePath(pathname: string): boolean {
  return (
    pathname === "/t" ||
    pathname.startsWith("/t/") ||
    pathname === "/signup"
  );
}

/**
 * Map an incoming deep-link / cold-start URL to an in-app path.
 * Accepts https://tradiesmate.co.uk/t/... or custom-scheme URLs.
 */
export function pathFromDeepLink(url: string): string | null {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.search}${u.hash}`;
    if (path.startsWith("/t")) return path;
    // Some hosts may open root with query only
    if (u.searchParams.has("token")) {
      return `/t/auth?token=${encodeURIComponent(u.searchParams.get("token")!)}`;
    }
    return null;
  } catch {
    return null;
  }
}
