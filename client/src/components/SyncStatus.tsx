import { useState } from "react";
import { formatSyncedAt, useOffline } from "../lib/connectivity";
import { useOutboxItems } from "../lib/useOutbox";
import { removeFromOutbox } from "../lib/outbox";

/**
 * One line under the header covering both halves of working with no signal:
 * what the tradie is looking at, and what of theirs hasn't landed yet.
 *
 * The field-service literature is blunt about why this has to be visible: a
 * worker who can't tell whether their last job synced will either re-enter it
 * (duplicates) or assume it saved (gaps). Tapping opens the list so "2 waiting"
 * is never a mystery.
 */
export function SyncStatus({ syncedAt }: { syncedAt?: number }) {
  const offline = useOffline();
  const items = useOutboxItems();
  const [open, setOpen] = useState(false);

  const waiting = items.filter((i) => !i.failedReason);
  const failed = items.filter((i) => i.failedReason);

  if (!offline && waiting.length === 0 && failed.length === 0) return null;

  const summary = offline
    ? `Offline · saved ${formatSyncedAt(syncedAt)}`
    : waiting.length > 0
      ? `Syncing ${waiting.length} item${waiting.length === 1 ? "" : "s"}…`
      : `${failed.length} item${failed.length === 1 ? "" : "s"} need${failed.length === 1 ? "s" : ""} a look`;

  const queuedNote =
    offline && waiting.length > 0
      ? ` · ${waiting.length} to send`
      : offline && failed.length > 0
        ? ` · ${failed.length} need${failed.length === 1 ? "s" : ""} a look`
        : "";

  return (
    <>
      <button
        type="button"
        className={`t-offline-strip${failed.length ? " t-offline-strip--attention" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="t-offline-dot" aria-hidden="true" />
        <span>
          {summary}
          <span className="t-offline-strip-when">{queuedNote}</span>
        </span>
        {items.length > 0 && <span className="t-offline-strip-more">{open ? "Hide" : "Details"}</span>}
      </button>

      {open && items.length > 0 && (
        <ul className="t-sync-list">
          {items.map((item) => (
            <li key={item.id} className={item.failedReason ? "is-failed" : undefined}>
              <div>
                <strong>{item.label}</strong>
                <span>
                  {item.failedReason
                    ? item.failedReason
                    : offline
                      ? "Waiting for signal"
                      : "Sending…"}
                </span>
              </div>
              {item.failedReason && (
                <button type="button" onClick={() => void removeFromOutbox(item.id)}>
                  Discard
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
