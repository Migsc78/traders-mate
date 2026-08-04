import type { Job, JobCommercial, JobOperational } from "@prisma/client";

/**
 * The two status models, and the one action that matters right now.
 *
 * Operational and commercial are deliberately separate. A single badge cannot say
 * both, and when it tried, a job finished last Tuesday but never billed looked
 * exactly like one quoted this morning and not started — which is how unbilled
 * work becomes invisible.
 */

export const OPERATIONAL_LABEL: Record<JobOperational, string> = {
  UNSCHEDULED: "Unscheduled",
  SCHEDULED: "Scheduled",
  ON_THE_WAY: "On the way",
  IN_PROGRESS: "In progress",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const COMMERCIAL_LABEL: Record<JobCommercial, string> = {
  UNQUOTED: "No quote",
  QUOTED: "Quoted",
  DEPOSIT_DUE: "Deposit due",
  DEPOSIT_PAID: "Deposit paid",
  READY_TO_INVOICE: "Ready to invoice",
  INVOICE_SENT: "Invoice sent",
  PAID: "Paid",
};

/** Which pipeline tab a job belongs under. */
export type JobBucket =
  | "to_schedule"
  | "upcoming"
  | "in_progress"
  | "to_invoice"
  | "done";

export function bucketOf(job: Pick<Job, "operational" | "commercial">): JobBucket {
  switch (job.operational) {
    case "UNSCHEDULED":
      return "to_schedule";
    case "SCHEDULED":
      return "upcoming";
    case "ON_THE_WAY":
    case "IN_PROGRESS":
    case "PAUSED":
      return "in_progress";
    case "COMPLETED":
      // The whole point of splitting the two states: completed work that hasn't
      // been billed is money the tradie has earned and forgotten, so it gets its
      // own tab rather than disappearing into "done".
      return job.commercial === "READY_TO_INVOICE" ? "to_invoice" : "done";
    case "CANCELLED":
      return "done";
  }
}

export type PrimaryAction = {
  /** Machine name — matches the route segment that performs it. */
  action:
    | "schedule"
    | "on-my-way"
    | "start"
    | "complete"
    | "invoice"
    | "record-payment"
    | "none";
  label: string;
  /** False when the action needs something the job hasn't got yet. */
  enabled: boolean;
  /** Why it's disabled, shown next to the button. Never a dead control. */
  hint?: string;
};

/**
 * One dominant action per state (PRD 14.2).
 *
 * Derived here rather than in the client so the button and the endpoint that
 * backs it can't drift apart.
 */
export function primaryAction(job: Pick<Job, "operational" | "commercial">): PrimaryAction {
  switch (job.operational) {
    case "UNSCHEDULED":
      return { action: "schedule", label: "Schedule job", enabled: true };
    case "SCHEDULED":
      return { action: "on-my-way", label: "On my way", enabled: true };
    case "ON_THE_WAY":
      return { action: "start", label: "Start job", enabled: true };
    case "IN_PROGRESS":
      return { action: "complete", label: "Complete job", enabled: true };
    case "PAUSED":
      return { action: "start", label: "Resume job", enabled: true };
    case "CANCELLED":
      return { action: "none", label: "Cancelled", enabled: false, hint: "This job was cancelled." };
    case "COMPLETED":
      switch (job.commercial) {
        case "READY_TO_INVOICE":
          return { action: "invoice", label: "Create invoice", enabled: true };
        case "INVOICE_SENT":
          return { action: "record-payment", label: "Record payment", enabled: true };
        case "PAID":
          return { action: "none", label: "Paid", enabled: false, hint: "Nothing left to do." };
        default:
          return { action: "invoice", label: "Create invoice", enabled: true };
      }
  }
}

/**
 * Operational moves the tradie is allowed to make from where they are.
 *
 * Guarded server-side because the phone can be hours out of date: a job started
 * in a cellar and synced later must not be able to un-complete itself.
 *
 * Finishing is reachable from every live state on purpose. An emergency
 * call-out gets done before anyone opens the app — no "on my way", no "start",
 * just a tradie in a kitchen at nine at night marking it done. Refusing that
 * because the ceremony was skipped would block someone from finishing their own
 * job, and the only thing it would protect is the tidiness of the state graph.
 */
const FINISH: JobOperational[] = ["COMPLETED", "CANCELLED"];

const ALLOWED: Record<JobOperational, JobOperational[]> = {
  UNSCHEDULED: ["SCHEDULED", "ON_THE_WAY", "IN_PROGRESS", ...FINISH],
  SCHEDULED: ["ON_THE_WAY", "IN_PROGRESS", "UNSCHEDULED", ...FINISH],
  ON_THE_WAY: ["IN_PROGRESS", "SCHEDULED", ...FINISH],
  IN_PROGRESS: ["PAUSED", ...FINISH],
  PAUSED: ["IN_PROGRESS", ...FINISH],
  // Reopening is the one move back, for a job signed off too early.
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["UNSCHEDULED"],
};

export function canMove(from: JobOperational, to: JobOperational): boolean {
  return from === to || ALLOWED[from].includes(to);
}
