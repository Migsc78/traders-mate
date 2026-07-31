import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

/**
 * Live online/offline state, via React Query's own online manager so the banner and
 * the query layer can never disagree about which one we're in.
 *
 * Caveat worth knowing: this is navigator.onLine, which means "attached to a network",
 * not "the internet answers". One bar of EDGE in a plant room still reads as online —
 * that case is covered by the degraded flag on <OfflineNotice />.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true
  );
}

/** "just now" / "14 min ago" / "yesterday 16:42" — for "showing data saved …". */
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
