/**
 * What to do with a queued write based on the server's answer.
 *
 * Pure and separate from the queue itself because the cost of getting it wrong is
 * asymmetric and invisible: classify a real rejection as "retry" and the queue
 * wedges behind it forever; classify a blip as "permanent" and a tradie's voice
 * note is quietly parked. Both only show up days later, on someone's phone.
 */
export type FlushVerdict =
  /** Landed. Drop it from the queue. */
  | "sent"
  /** The server refused this payload. Park it and tell the tradie. */
  | "permanent"
  /** Not this item's fault. Leave it queued and stop the run. */
  | "retry";

export function classifyFlushResponse(status: number): FlushVerdict {
  if (status >= 200 && status < 300) return "sent";

  // Session expired — nothing to do with this item, and every following item
  // would fail the same way. Stop so the app can re-authenticate.
  if (status === 401) return "retry";

  // Timeout and rate-limit are explicitly temporary despite being 4xx.
  if (status === 408 || status === 429) return "retry";

  // Any other 4xx is the server saying this payload is wrong. Retrying an
  // unchanged body can only fail again, and it would block everything behind it.
  if (status >= 400 && status < 500) return "permanent";

  // 5xx — the server is having a moment. The write is probably still good.
  return "retry";
}
