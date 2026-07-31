import { TradieApiError } from "../api/tradie";

/**
 * Renders a failed request, except when it failed for lack of signal.
 *
 * The offline strip in the shell already says that, once, at the top. Repeating
 * "No signal — this needs a connection" under every list turned a normal working
 * state into a page of red text.
 */
export function QueryError({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof TradieApiError && error.isOffline) return null;
  return <p className="error">{(error as Error).message}</p>;
}
