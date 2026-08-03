/**
 * Offline read cache for the tradie app.
 *
 * Tradies work in basements, plant rooms, farms and new builds where there is no
 * signal. This persists the React Query cache to IndexedDB so the job card,
 * customer address, diary, price book and recent quotes/invoices still open when
 * the phone has nothing.
 *
 * Reads only. Writes made with no signal go through the durable queue in
 * lib/outbox.ts, which is what stops a tradie ever seeing a save that silently
 * never happened.
 */
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { idbAvailable, idbTx } from "./idb";

const STORE = "kv";
const KEY = "tradie-query-cache";

/** Mirrors SESSION_KEY in ../api/tradie — duplicated to keep this module cycle-free. */
const SESSION_KEY = "tm_tradie_session";

/** Query key prefixes worth keeping on the device. */
const PERSISTED_KEYS = new Set([
  "tradie-me",
  "tradie-jobs",
  "tradie-job",
  "tradie-messages",
  "tradie-customers",
  "tradie-customer",
  "tradie-appointments",
  "tradie-price-book",
  "tradie-quotes",
  "tradie-quote",
  "tradie-quote-templates",
  "tradie-quote-template",
  "tradie-invoices",
  "tradie-certificates",
  "tradie-certificate",
  "tradie-inbox",
  "tradie-archived",
]);

/** Two weeks — long enough to cover a stretch of rural work without a sync. */
export const OFFLINE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function isPersistedQueryKey(queryKey: readonly unknown[]): boolean {
  return PERSISTED_KEYS.has(String(queryKey[0]));
}

/**
 * Cheap non-reversible fingerprint of the session token. The cache holds customer
 * names, phone numbers and addresses, so it must never be served to a different
 * account after a logout/login on a shared device.
 */
function ownerFingerprint(): string {
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return "anon";
  let hash = 5381;
  for (let i = 0; i < token.length; i += 1) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) | 0;
  }
  return `t${(hash >>> 0).toString(36)}`;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idbTx<T>(STORE, mode, run);
}

type Envelope = { owner: string; client: PersistedClient };

/**
 * IndexedDB-backed persister. Written by hand rather than pulling in an async-storage
 * persister package — it is three methods and we need the owner check anyway.
 *
 * Every operation degrades to a no-op if IndexedDB is unavailable (private browsing,
 * locked-down WebView). Losing the offline cache must never break the app.
 */
export function createOfflinePersister(): Persister {
  const available = idbAvailable();

  return {
    async persistClient(client: PersistedClient) {
      if (!available) return;
      try {
        const envelope: Envelope = { owner: ownerFingerprint(), client };
        await tx("readwrite", (store) => store.put(envelope, KEY));
      } catch {
        /* cache is best-effort */
      }
    },

    async restoreClient() {
      if (!available) return undefined;
      try {
        const envelope = await tx<Envelope | undefined>("readonly", (store) => store.get(KEY));
        if (!envelope) return undefined;
        // Different account (or signed out) → treat as no cache and bin it.
        if (envelope.owner !== ownerFingerprint()) {
          await clearOfflineCache();
          return undefined;
        }
        return envelope.client;
      } catch {
        return undefined;
      }
    },

    async removeClient() {
      await clearOfflineCache();
    },
  };
}

/** Wipe the on-device cache. Called on sign-out and on account mismatch. */
export async function clearOfflineCache(): Promise<void> {
  if (!idbAvailable()) return;
  try {
    await tx("readwrite", (store) => store.delete(KEY));
  } catch {
    /* nothing we can do, and nothing worth breaking the sign-out for */
  }
}
