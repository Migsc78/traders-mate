import { formatSyncedAt, useOnline } from "../lib/useOnline";

type Props = {
  /** When the visible data was last pulled from the server (query dataUpdatedAt). */
  syncedAt?: number;
  /**
   * Nominally online but requests are failing — one bar in a plant room. Shows the
   * same "saved data" message, because to the tradie it's the same situation.
   */
  degraded?: boolean;
};

/**
 * Tells the tradie exactly what they're looking at when there's no signal.
 *
 * The point is honesty: they can read everything, but nothing they type is going
 * anywhere yet. Silent staleness is worse than no data — it's what makes people
 * re-enter work they already did.
 */
export function OfflineNotice({ syncedAt, degraded = false }: Props) {
  const online = useOnline();
  if (online && !degraded) return null;

  return (
    <p className="t-banner t-banner--danger" role="status">
      {online ? "Can't reach the server" : "You're offline"} — showing your saved data from{" "}
      {formatSyncedAt(syncedAt)}. Jobs, customers and rates are all readable. Sending and saving
      need signal.
    </p>
  );
}
