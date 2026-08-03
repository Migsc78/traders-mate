/**
 * The one connection to the `tm-offline` database.
 *
 * Both the read cache and the outbox live in here, and both used to open their
 * own connection for every single operation and close it again on complete. That
 * is the pattern that broke offline swiping: archive a job with no signal and the
 * burst of open/close churn — persist the cache, write the outbox item, read it
 * back — would leave iOS's WKWebView with an `indexedDB.open()` that never fired
 * `onsuccess` at all. The queue write never resolved, the mutation stayed pending
 * forever, and every later swipe was refused. One swipe worked, nothing after it.
 *
 * So: one connection, opened once, kept open, shared. Plus a timeout, because a
 * hang that surfaces as an error can be shown to the tradie, and a hang that
 * doesn't is invisible.
 */

const DB_NAME = "tm-offline";

/** Version 2 added the outbox store alongside the read cache's kv store. */
const VERSION = 2;

/**
 * Long enough that a slow phone finishing a big cache write isn't cut off, short
 * enough that a wedged connection surfaces while the tradie still has the screen
 * in front of them.
 */
const OPEN_TIMEOUT_MS = 8000;

let dbPromise: Promise<IDBDatabase> | null = null;

export function idbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("IndexedDB did not open in time"));
    }, OPEN_TIMEOUT_MS);

    const req = indexedDB.open(DB_NAME, VERSION);

    // Both stores are created here, together. They used to be created in two
    // places that each had to remember the other's store, and whichever opened
    // second threw a VersionError if they drifted apart.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
    };

    req.onsuccess = () => {
      const db = req.result;
      if (settled) {
        // Timed out and already rejected — don't leak the connection.
        db.close();
        return;
      }
      settled = true;
      clearTimeout(timer);

      // Another tab upgrading must not be blocked by us holding this open.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };

      resolve(db);
    };

    req.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(req.error ?? new Error("IndexedDB open failed"));
    };
  });
}

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      // Don't cache a rejected promise — the next attempt deserves a fresh open.
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function runTx<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = run(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** A closed or stale connection — worth reopening once before giving up. */
function isStaleConnection(err: unknown): boolean {
  return err instanceof DOMException && err.name === "InvalidStateError";
}

export async function idbTx<T>(
  storeName: "kv" | "outbox",
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await getDb();
  try {
    return await runTx(db, storeName, mode, run);
  } catch (err) {
    if (!isStaleConnection(err)) throw err;
    // The tab was backgrounded long enough for the connection to be dropped.
    dbPromise = null;
    return runTx(await getDb(), storeName, mode, run);
  }
}
