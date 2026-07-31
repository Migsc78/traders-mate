import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  flushOutbox,
  initOutbox,
  outboxSnapshot,
  subscribeOutbox,
  type OutboxItem,
} from "./outbox";
import { useOffline } from "./connectivity";

/** Live view of what's still waiting to reach the server. */
export function useOutboxItems(): OutboxItem[] {
  return useSyncExternalStore(subscribeOutbox, outboxSnapshot, () => []);
}

/**
 * Drains the queue whenever there's signal.
 *
 * Mounted once in the shell. Runs on load and again on every transition back to
 * online, so a tradie who queued work in a basement has it sent by the time they
 * reach the van — no button, no prompt.
 */
export function useOutboxSync(enabled: boolean): void {
  const qc = useQueryClient();
  const offline = useOffline();

  const flush = useCallback(async () => {
    const touched = new Set<string>();
    await flushOutbox((item) => {
      for (const key of item.invalidates) touched.add(key);
    });
    // Pull the server's version of anything that just landed, so what the tradie
    // sees is the real record rather than the optimistic stand-in.
    for (const key of touched) void qc.invalidateQueries({ queryKey: [key] });
  }, [qc]);

  useEffect(() => {
    void initOutbox();
  }, []);

  useEffect(() => {
    if (!enabled || offline) return;
    void flush();
  }, [enabled, offline, flush]);
}
