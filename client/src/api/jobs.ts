import { tRequest } from "./tradie";

/**
 * Jobs — the operating pipeline.
 *
 * A job carries two independent statuses. Operational is where the work has got
 * to on the ground; commercial is where the money has got to. One badge trying
 * to say both is what made a job finished last Tuesday but never billed look
 * identical to one quoted this morning and not started.
 */

export type JobOperational =
  | "UNSCHEDULED"
  | "SCHEDULED"
  | "ON_THE_WAY"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export type JobCommercial =
  | "UNQUOTED"
  | "QUOTED"
  | "DEPOSIT_DUE"
  | "DEPOSIT_PAID"
  | "READY_TO_INVOICE"
  | "INVOICE_SENT"
  | "PAID";

export type JobBucket = "to_schedule" | "upcoming" | "in_progress" | "to_invoice" | "done";

export type PrimaryAction = {
  action: "schedule" | "on-my-way" | "start" | "complete" | "invoice" | "record-payment" | "none";
  label: string;
  enabled: boolean;
  hint?: string;
};

export type JobVisit = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  arrivalWindowStart: string | null;
  arrivalWindowEnd: string | null;
  kind?: string | null;
};

export type JobCard = {
  id: string;
  /** Legacy enquiry fields, still the customer's name and number. */
  name: string;
  phone: string;
  message: string | null;
  postcode: string | null;
  distanceMiles: number | null;
  createdAt: string;
  latestQuote: { id: string; status: string; totalPence: number } | null;

  reference: string | null;
  title: string;
  operational: JobOperational;
  commercial: JobCommercial;
  operationalLabel: string;
  commercialLabel: string;
  bucket: JobBucket;
  primaryAction: PrimaryAction;
  quotedTotalPence: number;
  depositPaidPence: number;
  archivedAt: string | null;
  completedAt: string | null;
  customer: { id: string; name: string } | null;
  property: { id: string; nickname: string | null; postcode: string | null } | null;
  nextVisit: JobVisit | null;
};

export type JobProfit = {
  revenuePence: number;
  materialsPence: number;
  labourPence: number;
  expensesPence: number;
  profitPence: number;
  marginPct: number | null;
  provisional: boolean;
  missingCostCount: number;
};

export type JobCost = {
  id: string;
  type: "MATERIAL" | "LABOUR" | "EXPENSE" | "SUBCONTRACTOR";
  label: string;
  qty: number;
  unit: string;
  /** Null means not recorded — not free. */
  unitCostPence: number | null;
  sellPricePence: number;
  vatRate: number;
  billable: boolean;
  isExtra: boolean;
  agreedAt: string | null;
  agreedVia: string | null;
  invoicedAt: string | null;
  receiptFile: { id: string; filename: string; url: string } | null;
};

export type JobEvent = {
  id: string;
  type: string;
  summary: string;
  createdAt: string;
};

export type JobDetail = {
  id: string;
  name: string;
  phone: string;
  message: string | null;
  postcode: string | null;
  photoUrls: string[];
  createdAt: string;
  quotes: Record<string, unknown>[];
  job: JobCard & {
    scope: string | null;
    visits: JobVisit[];
    costs: JobCost[];
    profit: JobProfit;
  };
};

export const jobsApi = {
  list: () => tRequest<JobCard[]>("/jobs"),
  detail: (id: string) => tRequest<JobDetail>(`/jobs/${id}`),
  costs: (id: string) =>
    tRequest<{ costs: JobCost[]; profit: JobProfit; labourCostPerHourPence: number | null }>(
      `/jobs/${id}/costs`
    ),
  events: (id: string) => tRequest<JobEvent[]>(`/jobs/${id}/events`),
};

/** How a bucket reads in the tab bar and in empty states. */
export const BUCKET_LABEL: Record<JobBucket, string> = {
  to_schedule: "To schedule",
  upcoming: "Upcoming",
  in_progress: "In progress",
  to_invoice: "To invoice",
  done: "Done",
};

/**
 * Which of the two badges deserves colour.
 *
 * Money first when it's owed: a completed job waiting to be billed is the one
 * thing on this screen that costs the tradie real money to ignore.
 */
export function commercialTone(commercial: JobCommercial): string {
  switch (commercial) {
    case "READY_TO_INVOICE":
      return "t-pill--orange";
    case "INVOICE_SENT":
      return "t-pill--amber";
    case "PAID":
      return "t-pill--green";
    case "DEPOSIT_DUE":
      return "t-pill--red";
    default:
      return "t-pill--slate";
  }
}

export function operationalTone(operational: JobOperational): string {
  switch (operational) {
    case "ON_THE_WAY":
    case "IN_PROGRESS":
      return "t-pill--green";
    case "SCHEDULED":
      return "t-pill--blue";
    case "CANCELLED":
      return "t-pill--grey";
    default:
      return "t-pill--slate";
  }
}
