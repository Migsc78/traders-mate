import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

/**
 * Whether the app can actually reach the API.
 *
 * navigator.onLine alone is not trustworthy here: inside iOS's WKWebView it
 * reported "online" with the phone in aeroplane mode, which is why the offline
 * banner used to say "Can't reach the server" instead of "You're offline".
 * So we also track what real requests are doing — a failed fetch is the only
 * honest signal that there's no usable connection.
 */
let serverReachable = true;
const listeners = new Set<() => void>();

/** Called by the API layer after every request. */
export function markServerReachable(ok: boolean): void {
  if (serverReachable === ok) return;
  serverReachable = ok;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const unsubscribeOnline = onlineManager.subscribe(onChange);
  return () => {
    listeners.delete(onChange);
    unsubscribeOnline();
  };
}

/**
 * True when nothing can be sent right now — either the device says it's offline
 * or the last request never made it. Both mean the same thing to a tradie, so
 * the UI doesn't distinguish them.
 */
export function useOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !onlineManager.isOnline() || !serverReachable,
    () => false
  );
}

/** Non-reactive read, for code paths outside React (the API layer). */
export function isOfflineNow(): boolean {
  return !onlineManager.isOnline() || !serverReachable;
}

/** "just now" / "14 min ago" / "yesterday 16:42" — for "saved …". */
export function formatSyncedAt(ts: number | undefined): string {
  if (!ts) return "earlier";
  const ageMs = Date.now() - ts;
  if (ageMs < 60_000) return "just now";
  const mins = Math.round(ageMs / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const when = new Date(ts);
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const days = Math.round(hours / 24);
  return days === 1 ? `yesterday ${time}` : `${when.toLocaleDateString("en-GB")} ${time}`;
}
