/**
 * Offline read cache for the tradie app.
 *
 * Tradies work in basements, plant rooms, farms and new builds where there is no
 * signal. This persists the React Query cache to IndexedDB so the job card,
 * customer address, diary, price book and recent quotes/invoices still open when
 * the phone has nothing.
 *
 * Reads only — offline writes are a separate piece of work. Nothing here queues
 * a mutation, so a tradie never sees a save that silently never happened.
 */
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

const DB_NAME = "tm-offline";
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => db.close();
      })
  );
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
  const available = typeof indexedDB !== "undefined";

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
  if (typeof indexedDB === "undefined") return;
  try {
    await tx("readwrite", (store) => store.delete(KEY));
  } catch {
    /* nothing we can do, and nothing worth breaking the sign-out for */
  }
}
