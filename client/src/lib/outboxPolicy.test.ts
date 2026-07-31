/**
 * Run: npm run test  (from client/)
 *
 * Covers the branch that decides whether a tradie's queued work is kept, retried
 * or binned. No IndexedDB or network involved — that's the point of the split.
 */
import { classifyFlushResponse } from "./outboxPolicy";

let failures = 0;

function check(status: number, expected: string, why: string) {
  const actual = classifyFlushResponse(status);
  if (actual !== expected) {
    console.error(`FAIL: ${status} → expected "${expected}", got "${actual}" (${why})`);
    failures += 1;
  }
}

// Landed — including 201, which is what the notes/voice routes return.
check(200, "sent", "plain OK");
check(201, "sent", "created — the draft-quote routes answer with this");
check(204, "sent", "no content still means it landed");

// Temporary, despite being 4xx.
check(401, "retry", "session expired, not the item's fault");
check(408, "retry", "request timeout");
check(429, "retry", "rate limited — backing off is the whole point");

// The server rejected this payload; retrying can only fail the same way.
check(400, "permanent", "malformed body");
check(403, "permanent", "not allowed");
check(404, "permanent", "job was deleted while the phone had no signal");
check(422, "permanent", "validation failed");

// Server-side wobble — the write is probably still good.
check(500, "retry", "internal error");
check(502, "retry", "bad gateway during a deploy");
check(503, "retry", "service unavailable");
check(504, "retry", "gateway timeout");

// Throw rather than process.exit — this file is typechecked with the browser libs
// (no @types/node), and an uncaught throw still exits non-zero under tsx.
if (failures > 0) throw new Error(`${failures} outbox classification failure(s)`);
console.log("OK: outbox flush classification (14 cases)");
