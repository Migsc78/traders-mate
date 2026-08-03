import { Browser } from "@capacitor/browser";
import { isNativeApp } from "./nativeApp";

/**
 * Open a customer-facing / external URL without trapping the Capacitor WebView.
 * Native: Capacitor Browser (closeable). Falls back if the plugin isn't synced yet.
 * Browser: normal new tab.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;

  const absolute = absolutize(url);

  if (isNativeApp()) {
    try {
      await Browser.open({ url: absolute });
      return;
    } catch {
      // Plugin missing until `cap sync` / rebuild — fall through.
    }
  }

  const opened = window.open(absolute, "_blank", "noopener,noreferrer");
  if (!opened && isNativeApp()) {
    // Last resort: stay in-app by returning false so callers can show a viewer.
    throw new Error("Could not open link");
  }
}

function absolutize(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) {
    const apiBase = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
    if (apiBase) return `${apiBase}${url}`;
    return `${window.location.origin}${url}`;
  }
  return url;
}
