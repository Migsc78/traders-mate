import Bottleneck from "bottleneck";
import { env } from "../env.js";

// Outbound limiter for Google Places (respect QPS / avoid cost blowups).
export const placesLimiter = new Bottleneck({
  maxConcurrent: 4,
  minTime: Math.ceil(1000 / Math.max(1, env.PLACES_MAX_QPS)),
});

// Separate limiter for cheap HTTP reachability HEAD/GETs.
export const reachLimiter = new Bottleneck({
  maxConcurrent: env.WEBSITE_CHECK_CONCURRENCY,
  minTime: 20,
});

/** Run fn with exponential backoff on transient failures. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; shouldRetry?: (e: unknown) => boolean } = {}
): Promise<T> {
  const retries = opts.retries ?? 5;
  const baseMs = opts.baseMs ?? 500;
  const shouldRetry = opts.shouldRetry ?? (() => true);

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !shouldRetry(err)) throw err;
      const delay = baseMs * 2 ** (attempt - 1) + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
