import type { Enquiry, Job, Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/error.js";
import { appendJobEvent } from "./events.js";
import { seedCostsFromQuote } from "./costs.js";

/** "J-1042" — short, human, unique enough per client without a counter table. */
export function newJobReference(): string {
  return `J-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

/** First sensible line of a message, for when there's no better title. */
function titleFrom(enquiry: Pick<Enquiry, "summary" | "message" | "name">): string {
  const summary = enquiry.summary?.trim();
  if (summary) return summary.slice(0, 120);
  const message = enquiry.message?.trim();
  if (message) return message.split(/\n/)[0].slice(0, 120);
  return `Job for ${enquiry.name}`;
}

/**
 * Turn an accepted quote into a job.
 *
 * The quote itself is never touched. It stays as the accepted commercial
 * baseline, and everything agreed afterwards arrives as a JobCost flagged
 * `isExtra` — so the original price a customer signed off remains readable
 * months later, which is the only version that matters in an argument.
 */
export async function createJobFromQuote(input: {
  clientId: string;
  quoteId: string;
  title?: string;
  scope?: string | null;
}): Promise<Job> {
  const quote = await prisma.quote.findFirst({
    where: { id: input.quoteId, clientId: input.clientId },
    include: { enquiry: true },
  });
  if (!quote) throw new ApiError(404, "not_found", "Quote not found");
  if (quote.status !== "ACCEPTED") {
    throw new ApiError(400, "not_accepted", "Only an accepted quote becomes a job");
  }

  const existing = await prisma.job.findFirst({
    where: { clientId: input.clientId, quoteId: quote.id },
  });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        clientId: input.clientId,
        enquiryId: quote.enquiryId,
        quoteId: quote.id,
        customerId: quote.enquiry?.customerId ?? null,
        propertyId: quote.enquiry?.propertyId ?? null,
        reference: newJobReference(),
        title: input.title?.trim() || (quote.enquiry ? titleFrom(quote.enquiry) : "Job"),
        scope: input.scope ?? quote.customerNote ?? quote.enquiry?.message ?? null,
        operational: "UNSCHEDULED",
        // A paid deposit is a different conversation on site from one that's
        // still owed, so the distinction is carried rather than flattened.
        commercial: quote.depositPaidAt
          ? "DEPOSIT_PAID"
          : quote.depositPence > 0
            ? "DEPOSIT_DUE"
            : "QUOTED",
        // Ex-VAT. VAT is not the tradie's money and must not reach profit.
        quotedTotalPence: quote.subtotalPence,
        depositPaidPence: quote.depositPaidAt ? quote.depositPence : 0,
      },
    });

    const seeded = await seedCostsFromQuote(tx, {
      clientId: input.clientId,
      jobId: job.id,
      quoteId: quote.id,
      vatInclusive: quote.vatInclusive,
    });

    await appendJobEvent(tx, {
      clientId: input.clientId,
      jobId: job.id,
      type: "job.created",
      summary: `Job created from quote ${quote.reference || quote.id.slice(-6)}`,
      payload: { quoteId: quote.id, seededCostLines: seeded },
    });

    return job;
  });
}

/**
 * Book work directly, with no quote — the call-out and annual-service path.
 *
 * Commercial state starts UNQUOTED: there is no agreed price, so the invoice will
 * be built from what actually gets recorded on the job.
 */
export async function createDirectJob(input: {
  clientId: string;
  title: string;
  scope?: string | null;
  /** Pass the source enquiry's id to keep /t/jobs/<id> pointing at both. */
  id?: string;
  enquiryId?: string | null;
  customerId?: string | null;
  propertyId?: string | null;
  siteContactId?: string | null;
}): Promise<Job> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        id: input.id,
        clientId: input.clientId,
        enquiryId: input.enquiryId ?? null,
        customerId: input.customerId ?? null,
        propertyId: input.propertyId ?? null,
        siteContactId: input.siteContactId ?? null,
        reference: newJobReference(),
        title: input.title.trim().slice(0, 120),
        scope: input.scope ?? null,
        operational: "UNSCHEDULED",
        commercial: "UNQUOTED",
      },
    });

    await appendJobEvent(tx, {
      clientId: input.clientId,
      jobId: job.id,
      type: "job.created",
      summary: "Job booked directly",
    });

    return job;
  });
}

/**
 * Promote an inbox enquiry into a job.
 *
 * The enquiry stays where it is with `pipeline` flipped, because the Inbox is
 * still the record of what came in and how it was qualified. What changes is
 * that the work now has a Job of its own instead of borrowing the enquiry's row.
 */
export async function promoteEnquiryToJob(input: {
  clientId: string;
  enquiryId: string;
}): Promise<{ enquiry: Enquiry; job: Job }> {
  const enquiry = await prisma.enquiry.findFirst({
    where: { id: input.enquiryId, clientId: input.clientId },
  });
  if (!enquiry) throw new ApiError(404, "not_found", "Not found");

  return prisma.$transaction(async (tx) => {
    const updatedEnquiry = await tx.enquiry.update({
      where: { id: enquiry.id },
      data: {
        pipeline: "JOB",
        promotedAt: enquiry.promotedAt || new Date(),
        killedAt: null,
        triage: enquiry.triage === "SPAM" ? "LIKELY_JOB" : enquiry.triage,
      },
    });

    const existing = await tx.job.findFirst({
      where: { clientId: input.clientId, enquiryId: enquiry.id },
    });
    if (existing) return { enquiry: updatedEnquiry, job: existing };

    // Reuses the enquiry's id, matching the backfill: /t/jobs/<id> resolves for
    // both migrated and newly promoted work, so links and queued offline writes
    // don't have to know which is which.
    const job = await tx.job.create({
      data: {
        id: enquiry.id,
        clientId: input.clientId,
        enquiryId: enquiry.id,
        customerId: enquiry.customerId,
        propertyId: enquiry.propertyId,
        reference: newJobReference(),
        title: titleFrom(enquiry),
        scope: enquiry.message,
        operational: "UNSCHEDULED",
        commercial: "UNQUOTED",
      },
    });

    await appendJobEvent(tx, {
      clientId: input.clientId,
      jobId: job.id,
      type: "job.created",
      summary: "Promoted from inbox",
      payload: { enquiryId: enquiry.id, source: enquiry.source },
    });

    return { enquiry: updatedEnquiry, job };
  });
}

/** Shared include for the list — enough for a card, no more. */
export const jobCardInclude = {
  customer: { select: { id: true, name: true } },
  property: { select: { id: true, nickname: true, postcode: true } },
  enquiry: { select: { id: true, name: true, phone: true, postcode: true } },
  quote: { select: { id: true, status: true, totalPence: true, reference: true } },
  visits: {
    // The *next* visit, which means one that hasn't happened. A job with a
    // completed first fix and a second fix booked for Thursday must not show
    // last week's date as what's coming up — on a job with two visits that is
    // the difference between turning up and not.
    where: { status: { notIn: ["CANCELLED", "DONE", "NO_SHOW"] } },
    orderBy: { startsAt: "asc" },
    take: 1,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      arrivalWindowStart: true,
      arrivalWindowEnd: true,
    },
  },
} satisfies Prisma.JobInclude;
