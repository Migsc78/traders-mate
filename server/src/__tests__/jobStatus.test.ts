/**
 * Run: npx tsx src/__tests__/jobStatus.test.ts
 *
 * The transition guard exists to stop nonsense arriving from a phone that has
 * been offline for hours — not to enforce ceremony. The line between those two
 * is the whole test.
 */
import { bucketOf, canMove, primaryAction } from "../services/jobs/status.js";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failures += 1;
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, actual === expected, `expected ${expected}, got ${actual}`);
}

/* ------------------------------------------------------------- finishing */

// An emergency call-out is done before anyone opens the app. Refusing to let a
// tradie finish his own job because he never tapped "on my way" would block real
// work to protect a tidy state graph.
check("can finish straight from unscheduled", canMove("UNSCHEDULED", "COMPLETED"));
check("can finish from scheduled", canMove("SCHEDULED", "COMPLETED"));
check("can finish from on the way", canMove("ON_THE_WAY", "COMPLETED"));
check("can finish from in progress", canMove("IN_PROGRESS", "COMPLETED"));
check("can finish from paused", canMove("PAUSED", "COMPLETED"));
check("can cancel from anywhere live", canMove("UNSCHEDULED", "CANCELLED"));

/* ------------------------------------------------------- but not nonsense */

// The real risk: a queued write from hours ago landing on a job that has since
// moved on, and quietly undoing the finish.
check("a completed job cannot un-complete to scheduled", !canMove("COMPLETED", "SCHEDULED"));
check("nor back to unscheduled", !canMove("COMPLETED", "UNSCHEDULED"));
check("nor on the way", !canMove("COMPLETED", "ON_THE_WAY"));
check("but can be reopened if signed off too early", canMove("COMPLETED", "IN_PROGRESS"));
check("same state is always fine — replays are not errors", canMove("COMPLETED", "COMPLETED"));

/* --------------------------------------------------------------- buckets */

eq("unscheduled work needs a date", bucketOf({ operational: "UNSCHEDULED", commercial: "QUOTED" }), "to_schedule");
eq("scheduled work is upcoming", bucketOf({ operational: "SCHEDULED", commercial: "QUOTED" }), "upcoming");
eq("on the way counts as in progress", bucketOf({ operational: "ON_THE_WAY", commercial: "QUOTED" }), "in_progress");

// The whole point of splitting the two statuses: done-and-unbilled is its own
// place, not lumped in with done-and-paid.
eq(
  "completed but unbilled is money waiting",
  bucketOf({ operational: "COMPLETED", commercial: "READY_TO_INVOICE" }),
  "to_invoice"
);
eq("completed and paid is done", bucketOf({ operational: "COMPLETED", commercial: "PAID" }), "done");
eq(
  "completed and invoiced is done",
  bucketOf({ operational: "COMPLETED", commercial: "INVOICE_SENT" }),
  "done"
);

/* ---------------------------------------------------------- primary action */

eq("unscheduled", primaryAction({ operational: "UNSCHEDULED", commercial: "QUOTED" }).action, "schedule");
eq("scheduled", primaryAction({ operational: "SCHEDULED", commercial: "QUOTED" }).action, "on-my-way");
eq("on the way", primaryAction({ operational: "ON_THE_WAY", commercial: "QUOTED" }).action, "start");
eq("in progress", primaryAction({ operational: "IN_PROGRESS", commercial: "QUOTED" }).action, "complete");
eq(
  "completed and unbilled",
  primaryAction({ operational: "COMPLETED", commercial: "READY_TO_INVOICE" }).action,
  "invoice"
);
eq(
  "invoice sent",
  primaryAction({ operational: "COMPLETED", commercial: "INVOICE_SENT" }).action,
  "record-payment"
);

const paid = primaryAction({ operational: "COMPLETED", commercial: "PAID" });
eq("paid has nothing left to do", paid.action, "none");
check("and says so rather than offering a dead button", paid.enabled === false && !!paid.hint);

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("OK: job status (27 assertions)");
