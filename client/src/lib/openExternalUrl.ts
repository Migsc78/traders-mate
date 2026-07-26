import { Browser } from "@capacitor/browser";
import { isNativeApp } from "./nativeApp";

/**
 * Open a customer-facing / external URL without trapping the Capacitor WebView.
 * Native: system in-app browser with a close control.
 * Browser: normal new tab.
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  if (isNativeApp()) {
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
