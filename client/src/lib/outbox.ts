/**
 * Durable queue for writes made with no signal.
 *
 * A tradie standing in a plant room can record a voice note, type up a job, add a
 * customer or book a visit, and it lands on the server when they next hit signal —
 * without them tapping anything or knowing it happened.
 *
 * Two rules make this safe rather than lossy:
 *
 * 1. Items are written to IndexedDB *before* the UI confirms anything, so closing
 *    the app (or the phone dying) can't take the work with it. React Query's own
 *    paused-mutation support was the alternative and it fails exactly here — it
 *    keeps the queue in memory only.
 * 2. Each item carries a UUID sent as Idempotency-Key. A request can succeed on
 *    the server and still die on the way back; retrying it must not build a second
 *    draft quote. The server replays the original response instead.
 */
import { apiUrl } from "../api/base";
import { classifyFlushResponse } from "./outboxPolicy";

const DB_NAME = "tm-offline";
const STORE = "outbox";
const SESSION_KEY = "tm_tradie_session"; // mirrors api/tradie, kept local to avoid a cycle

export type OutboxItem = {
  /** Also the Idempotency-Key. */
  id: string;
  /** Human label for the sync sheet: "Voice note · Jono Smith". */
  label: string;
  /** Path under /api/t, e.g. "/jobs/abc/voice". */
  path: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  body: unknown;
  /** Query keys to refresh once this lands. */
  invalidates: string[];
  createdAt: number;
  attempts: number;
  /** Set when the server rejected it outright — needs the tradie to look. */
  failedReason?: string;
};

export function newOutboxId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ------------------------------------------------------------------ storage */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Version 2 — the offline read cache created this database at version 1.
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
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

/* ---------------------------------------------------------------- listeners */

const listeners = new Set<() => void>();
let snapshot: OutboxItem[] = [];

function notify() {
  for (const listener of listeners) listener();
}

export function subscribeOutbox(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Synchronous view for useSyncExternalStore — refreshed after every change. */
export function outboxSnapshot(): OutboxItem[] {
  return snapshot;
}

async function refreshSnapshot(): Promise<OutboxItem[]> {
  const all = await tx<OutboxItem[]>("readonly", (store) => store.getAll());
  snapshot = all.sort((a, b) => a.createdAt - b.createdAt);
  notify();
  return snapshot;
}

/** Load what's already queued from a previous session. */
export async function initOutbox(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await refreshSnapshot();
  } catch {
    /* an unreadable queue must not stop the app booting */
  }
}

/* ------------------------------------------------------------------- queue */

export type EnqueueInput = Omit<OutboxItem, "id" | "createdAt" | "attempts"> & { id?: string };

/**
 * Persist a write for later. Returns the id, which is also its idempotency key.
 *
 * Pass `id` when the caller already attempted the request with that key — the
 * attempt may have reached the server, and reusing the key is what stops the
 * retry creating a second copy.
 */
export async function enqueue(input: EnqueueInput): Promise<string> {
  const item: OutboxItem = {
    ...input,
    id: input.id ?? newOutboxId(),
    createdAt: Date.now(),
    attempts: 0,
  };
  await tx("readwrite", (store) => store.put(item));
  await refreshSnapshot();
  return item.id;
}

export async function removeFromOutbox(id: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(id));
  await refreshSnapshot();
}

async function update(item: OutboxItem): Promise<void> {
  await tx("readwrite", (store) => store.put(item));
  await refreshSnapshot();
}

/** Wipe the queue — called on sign-out alongside the read cache. */
export async function clearOutbox(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    await tx("readwrite", (store) => store.clear());
    await refreshSnapshot();
  } catch {
    /* nothing worth breaking sign-out for */
  }
}

/* ------------------------------------------------------------------- flush */

let flushing = false;

export type FlushResult = { sent: number; failed: number; stoppedOffline: boolean };

/**
 * Send everything queued, oldest first.
 *
 * Order matters: a tradie's second edit to a quote must not overtake the first,
 * so this is strictly sequential and stops at the first network failure rather
 * than racing ahead. A 4xx is treated as permanent — retrying a rejected payload
 * forever would just wedge the queue behind it.
 */
export async function flushOutbox(onItemSent?: (item: OutboxItem) => void): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, stoppedOffline: false };
  if (flushing || typeof indexedDB === "undefined") return result;
  flushing = true;

  try {
    const items = await refreshSnapshot();
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) return result;

    for (const item of items) {
      if (item.failedReason) continue; // already parked for the tradie to deal with

      let res: Response;
      try {
        res = await fetch(apiUrl(`/api/t${item.path}`), {
          method: item.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "Idempotency-Key": item.id,
          },
          body: JSON.stringify(item.body),
        });
      } catch {
        // Still no signal. Leave everything queued and try again next time.
        result.stoppedOffline = true;
        break;
      }

      const verdict = classifyFlushResponse(res.status);

      if (verdict === "sent") {
        await removeFromOutbox(item.id);
        result.sent += 1;
        onItemSent?.(item);
        continue;
      }

      if (verdict === "permanent") {
        let message = `Rejected (${res.status})`;
        try {
          const body = await res.json();
          message = body?.error?.message || message;
        } catch {
          /* keep the status-code message */
        }
        await update({ ...item, attempts: item.attempts + 1, failedReason: message });
        result.failed += 1;
        continue;
      }

      // Retryable — leave it queued and stop, so nothing overtakes it.
      await update({ ...item, attempts: item.attempts + 1 });
      result.stoppedOffline = true;
      break;
    }
  } finally {
    flushing = false;
  }

  return result;
}
