import { Router } from "express";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { idempotent } from "../middleware/idempotency.js";
import { requireClient, requireActiveAccount, clientId, customerPhoneKey } from "./tradie.js";
import { quoteLineInclude, ensurePriceBook } from "../services/quotes/priceBook.js";
import { buildDraftQuoteFromTranscript } from "../services/quotes/draft.js";
import { transcribeWithWhisper } from "../services/quotes/whisper.js";
import { storeAudio } from "../services/storage/store.js";
import { sendMessage } from "../services/messaging/sender.js";
import { logMessage } from "../services/messaging/log.js";
import {
  createDirectJob,
  createJobFromQuote,
  jobCardInclude,
  newJobReference,
  promoteEnquiryToJob,
} from "../services/jobs/create.js";
import { appendJobEvent, listJobEvents } from "../services/jobs/events.js";
import { computeProfit, getJobCosts, netOf } from "../services/jobs/costs.js";
import {
  bucketOf,
  canMove,
  COMMERCIAL_LABEL,
  OPERATIONAL_LABEL,
  primaryAction,
} from "../services/jobs/status.js";
import { distanceMilesBetween, extractPostcode, normalizePostcode } from "../services/geo/postcode.js";
import { toE164UK } from "../services/messaging/sender.js";
import { accessSelect, maskAccess } from "../services/customers/record.js";
import { createInvoiceFromJob, previewJobInvoice } from "../services/jobs/invoice.js";

/**
 * Everything under /jobs.
 *
 * Mounted ahead of tradieRouter, which no longer answers any /jobs path. Two
 * routers competing for one prefix is how a silent 404 hides, so the old
 * handlers were deleted in the same commit that added these rather than left to
 * lose a race.
 */
export const jobsRouter = Router();

type JobWithCard = Awaited<ReturnType<typeof loadJob>>;

async function loadJob(cid: string, id: string) {
  const job = await prisma.job.findFirst({
    where: { id, clientId: cid },
    include: jobCardInclude,
  });
  if (!job) throw new ApiError(404, "not_found", "Job not found");
  return job;
}

/**
 * The card shape.
 *
 * Deliberately a superset of what the old enquiry-backed list returned: the app
 * on the tradie's phone is still the previous build until a release ships, and
 * it must not start rendering blanks the moment the server updates.
 */
function serializeCard(job: JobWithCard) {
  const visit = job.visits[0] || null;
  return {
    id: job.id,
    // Legacy enquiry fields — the current client still reads these.
    name: job.enquiry?.name || job.customer?.name || "Customer",
    phone: job.enquiry?.phone || "",
    message: job.scope,
    postcode: job.enquiry?.postcode || job.property?.postcode || null,
    distanceMiles: null as number | null,
    createdAt: job.createdAt,
    latestQuote: job.quote
      ? { id: job.quote.id, status: job.quote.status, totalPence: job.quote.totalPence }
      : null,

    // The job proper.
    reference: job.reference,
    title: job.title,
    operational: job.operational,
    commercial: job.commercial,
    operationalLabel: OPERATIONAL_LABEL[job.operational],
    commercialLabel: COMMERCIAL_LABEL[job.commercial],
    bucket: bucketOf(job),
    primaryAction: primaryAction(job),
    quotedTotalPence: job.quotedTotalPence,
    depositPaidPence: job.depositPaidPence,
    archivedAt: job.archivedAt,
    completedAt: job.completedAt,
    customer: job.customer,
    property: job.property,
    nextVisit: visit,
  };
}

// ---------------------------------------------------------------- list

jobsRouter.get("/jobs", requireClient, async (req, res, next) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { clientId: clientId(req), archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: jobCardInclude,
    });
    res.json(jobs.map(serializeCard));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- create

jobsRouter.post("/jobs", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const body = z
      .object({
        name: z.string().trim().min(1).max(120),
        phone: z.string().trim().min(7).max(40),
        message: z.string().trim().max(2000).nullable().optional(),
        postcode: z.string().trim().max(16).nullable().optional(),
        title: z.string().trim().max(120).optional(),
      })
      .parse(req.body ?? {});

    const phone = toE164UK(body.phone);
    const phoneKey = customerPhoneKey(phone);
    if (phoneKey.length < 8) throw new ApiError(400, "bad_phone", "Enter a valid UK mobile or landline");

    const rawPc = body.postcode?.trim() || extractPostcode(body.message || "") || null;
    const postcode = rawPc ? normalizePostcode(rawPc) || rawPc.toUpperCase() : null;

    // The enquiry is still created: it owns the phone number and the message
    // thread, and killing it here would orphan two-way SMS. What's changed is
    // that it no longer pretends to be the job.
    const enquiry = await prisma.enquiry.create({
      data: {
        clientId: cid,
        name: body.name.trim(),
        phone,
        message: body.message?.trim() || null,
        postcode,
        source: "manual",
        status: "ROUTED",
        pipeline: "JOB",
        triage: "LIKELY_JOB",
        summary: body.title?.trim() || body.message?.trim()?.slice(0, 160) || "Manual job",
        deliveredAt: new Date(),
        deliveryInfo: "Created manually in TradiesMate",
        promotedAt: new Date(),
      },
    });

    await prisma.customerContact.upsert({
      where: { clientId_phoneKey: { clientId: cid, phoneKey } },
      create: { clientId: cid, phoneKey, phone, name: body.name.trim() },
      update: { phone, name: body.name.trim() },
    });

    await createDirectJob({
      clientId: cid,
      enquiryId: enquiry.id,
      title: body.title?.trim() || body.message?.trim()?.slice(0, 120) || `Job for ${body.name.trim()}`,
      scope: body.message?.trim() || null,
    });

    const job = await prisma.job.findFirstOrThrow({
      where: { clientId: cid, enquiryId: enquiry.id },
      include: jobCardInclude,
    });
    res.json(serializeCard(job));
  } catch (err) {
    next(err);
  }
});

/**
 * A lead captured by hand, straight into the Inbox.
 *
 * Deliberately creates an enquiry and *not* a job. Someone who rang about a leak
 * is not work yet — they're a prospect who might not answer the phone, might be
 * ringing four other plumbers, might turn out to be nothing. Making a job of
 * them here would put them in the pipeline as agreed work and quietly inflate
 * every count on the Jobs screen. Promoting from the Inbox is the moment that
 * decision gets made, and it already exists.
 */
jobsRouter.post(
  "/inbox",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const body = z
        .object({
          id: z.string().optional(),
          name: z.string().trim().min(1).max(120),
          phone: z.string().trim().min(7).max(40),
          email: z.string().trim().max(200).nullable().optional(),
          addressLine: z.string().trim().max(200).nullable().optional(),
          postcode: z.string().trim().max(16).nullable().optional(),
          message: z.string().trim().max(2000).nullable().optional(),
          urgency: z.enum(["ASAP", "THIS_WEEK", "FLEXIBLE"]).optional(),
          photoUrls: z.array(z.string().url().max(600)).max(6).optional(),
        })
        .parse(req.body ?? {});

      const phone = toE164UK(body.phone);
      if (customerPhoneKey(phone).length < 8) {
        throw new ApiError(400, "bad_phone", "Enter a valid UK mobile or landline");
      }

      // Prefer what was typed in the postcode box; fall back to anything that
      // looks like a postcode in the description, same as the website intake.
      const rawPc = body.postcode?.trim() || extractPostcode(body.message || "") || null;
      const postcode = rawPc ? normalizePostcode(rawPc) || rawPc.toUpperCase() : null;

      // Replayed from the outbox: the phone minted the id, so a second attempt
      // updates the same lead rather than leaving two in the Inbox.
      const existing = body.id
        ? await prisma.enquiry.findFirst({ where: { id: body.id, clientId: cid } })
        : null;
      if (existing) {
        return res.json(existing);
      }

      const enquiry = await prisma.enquiry.create({
        data: {
          ...(body.id ? { id: body.id } : {}),
          clientId: cid,
          name: body.name.trim(),
          phone,
          email: body.email?.trim() || null,
          addressLine: body.addressLine?.trim() || null,
          postcode,
          message: body.message?.trim() || null,
          urgency: body.urgency ?? null,
          photoUrls: body.photoUrls ?? [],
          source: "manual",
          status: "ROUTED",
          pipeline: "INBOX",
          // A lead the tradie typed in himself is one he already believes in —
          // it hasn't been through the missed-call qualifier, and defaulting it
          // to "needs a look" would make him triage his own note.
          triage: "LIKELY_JOB",
          summary: body.message?.trim()?.slice(0, 160) || `Enquiry from ${body.name.trim()}`,
          deliveredAt: new Date(),
          deliveryInfo: "Added manually in TradiesMate",
        },
      });

      res.status(201).json(enquiry);

      // Mileage is worked out after the answer has gone back, never before it.
      // Geocoding is a network call with retries, so a postcode the lookup
      // doesn't recognise would leave the tradie holding a spinner for a second
      // to earn a "~3 mi" on the card. A lead without a mileage is still a lead.
      if (postcode) {
        void (async () => {
          try {
            const client = await prisma.client.findUnique({
              where: { id: cid },
              select: { postcode: true },
            });
            const miles = await distanceMilesBetween(client?.postcode ?? null, postcode);
            if (miles != null) {
              await prisma.enquiry.update({ where: { id: enquiry.id }, data: { distanceMiles: miles } });
            }
          } catch {
            /* nothing to tell the tradie — they already have their lead */
          }
        })();
      }
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.post(
  "/jobs/from-quote/:quoteId",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const body = z
        .object({
          title: z.string().trim().max(120).optional(),
          scope: z.string().trim().max(4000).nullable().optional(),
        })
        .parse(req.body ?? {});
      const created = await createJobFromQuote({
        clientId: clientId(req),
        quoteId: req.params.quoteId,
        title: body.title,
        scope: body.scope,
      });
      const job = await loadJob(clientId(req), created.id);
      res.status(201).json(serializeCard(job));
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.post("/jobs/:jobId/promote", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const { enquiry, job } = await promoteEnquiryToJob({
      clientId: clientId(req),
      enquiryId: req.params.jobId,
    });
    res.json({
      id: job.id,
      pipeline: enquiry.pipeline,
      triage: enquiry.triage,
      promotedAt: enquiry.promotedAt,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- lifecycle

jobsRouter.post(
  "/jobs/:jobId/archive",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const job = await prisma.job.findFirst({ where: { id: req.params.jobId, clientId: cid } });
      if (!job) throw new ApiError(404, "not_found", "Job not found");
      if (job.archivedAt) return res.json({ id: job.id, archivedAt: job.archivedAt, alreadyArchived: true });
      const updated = await prisma.job.update({
        where: { id: job.id },
        data: { archivedAt: new Date() },
      });
      if (job.enquiryId) {
        await prisma.enquiry.updateMany({ where: { id: job.enquiryId, clientId: cid }, data: { pipeline: "ARCHIVED" } });
      }
      res.json({ id: updated.id, archivedAt: updated.archivedAt });
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.post(
  "/jobs/:jobId/unarchive",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const job = await prisma.job.findFirst({ where: { id: req.params.jobId, clientId: cid } });
      if (!job) throw new ApiError(404, "not_found", "Archived job not found");
      const updated = await prisma.job.update({ where: { id: job.id }, data: { archivedAt: null } });
      if (job.enquiryId) {
        await prisma.enquiry.updateMany({
          where: { id: job.enquiryId, clientId: cid },
          data: { pipeline: "JOB", promotedAt: new Date() },
        });
      }
      res.json({ id: updated.id, archivedAt: null });
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.delete(
  "/jobs/:jobId",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const job = await prisma.job.findFirst({ where: { id: req.params.jobId, clientId: cid } });
      // A delete replayed from the offline queue must succeed, not 404 — the
      // first attempt may well have landed before the connection died.
      if (!job) return res.json({ ok: true, id: req.params.jobId, alreadyDeleted: true });
      await prisma.job.delete({ where: { id: job.id } });
      if (job.enquiryId) {
        await prisma.enquiry.deleteMany({ where: { id: job.enquiryId, clientId: cid } });
      }
      res.json({ ok: true, id: job.id });
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.post("/jobs/:jobId/kill", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const body = z.object({ reason: z.enum(["dead", "spam"]) }).parse(req.body ?? {});
    const enquiry = await prisma.enquiry.findFirst({ where: { id: req.params.jobId, clientId: cid } });
    if (!enquiry) throw new ApiError(404, "not_found", "Not found");

    const updated = await prisma.enquiry.update({
      where: { id: enquiry.id },
      data: {
        pipeline: "KILLED",
        killedAt: new Date(),
        triage: body.reason === "spam" ? "SPAM" : enquiry.triage,
        summary:
          body.reason === "spam"
            ? enquiry.summary || "Marked spam by tradie"
            : enquiry.summary || "Marked not interested",
      },
    });

    if (body.reason === "spam") {
      await prisma.missedCall.updateMany({
        where: { enquiryId: enquiry.id, clientId: cid },
        data: { status: "SPAM" },
      });
    }

    // A killed lead was never work, so any job created off it goes too.
    await prisma.job.deleteMany({ where: { clientId: cid, enquiryId: enquiry.id } });

    res.json({
      id: updated.id,
      pipeline: updated.pipeline,
      triage: updated.triage,
      killedAt: updated.killedAt,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- detail

jobsRouter.get("/jobs/:jobId", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, clientId: cid },
      include: {
        ...jobCardInclude,
        visits: { orderBy: { startsAt: "asc" } },
      },
    });
    if (!job) throw new ApiError(404, "not_found", "Job not found");

    const [quotes, costs, client] = await Promise.all([
      job.enquiryId
        ? prisma.quote.findMany({
            where: { enquiryId: job.enquiryId, status: { notIn: ["DELETED", "ARCHIVED"] } },
            orderBy: { createdAt: "desc" },
            include: { lines: quoteLineInclude },
          })
        : Promise.resolve([]),
      getJobCosts(cid, job.id),
      prisma.client.findUnique({ where: { id: cid }, select: { labourCostPerHourPence: true } }),
    ]);

    const card = serializeCard({ ...job, visits: job.visits.slice(0, 1) } as JobWithCard);

    res.json({
      // Legacy enquiry-shaped fields first: the shipped client reads these
      // directly off the response and would render blanks without them.
      id: job.id,
      name: card.name,
      phone: card.phone,
      message: job.scope,
      postcode: card.postcode,
      photoUrls: [] as string[],
      createdAt: job.createdAt,
      quotes,

      job: {
        ...card,
        scope: job.scope,
        visits: job.visits,
        costs,
        profit: computeProfit(job, costs, client?.labourCostPerHourPence ?? null),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- state changes

const scheduleSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  arrivalWindowStart: z.string().datetime().nullable().optional(),
  arrivalWindowEnd: z.string().datetime().nullable().optional(),
  kind: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Schedule the job — which is to say, create its visit and its diary entry at once. */
jobsRouter.post(
  "/jobs/:jobId/schedule",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const body = scheduleSchema.parse(req.body ?? {});
      const job = await loadJob(cid, req.params.jobId);

      const startsAt = new Date(body.startsAt);
      const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

      const visit = await prisma.$transaction(async (tx) => {
        const created = await tx.appointment.create({
          data: {
            clientId: cid,
            jobId: job.id,
            enquiryId: job.enquiryId,
            title: job.title,
            notes: body.notes ?? null,
            kind: body.kind ?? null,
            startsAt,
            endsAt,
            arrivalWindowStart: body.arrivalWindowStart ? new Date(body.arrivalWindowStart) : null,
            arrivalWindowEnd: body.arrivalWindowEnd ? new Date(body.arrivalWindowEnd) : null,
            status: "SCHEDULED",
            address: job.property?.postcode || job.enquiry?.postcode || null,
            customerName: job.customer?.name || job.enquiry?.name || null,
            customerPhone: job.enquiry?.phone || null,
          },
        });

        if (job.operational === "UNSCHEDULED") {
          await tx.job.update({ where: { id: job.id }, data: { operational: "SCHEDULED" } });
        }

        await appendJobEvent(tx, {
          clientId: cid,
          jobId: job.id,
          type: "job.scheduled",
          summary: `Visit scheduled for ${startsAt.toLocaleDateString("en-GB")}`,
          payload: { visitId: created.id, startsAt: created.startsAt.toISOString() },
        });

        return created;
      });

      res.status(201).json(visit);
    } catch (err) {
      next(err);
    }
  })
);

/** One handler for the three taps that move a job along on site. */
function transitionRoute(
  segment: "on-my-way" | "start" | "complete",
  to: "ON_THE_WAY" | "IN_PROGRESS" | "COMPLETED"
) {
  jobsRouter.post(
    `/jobs/:jobId/${segment}`,
    requireClient,
    requireActiveAccount,
    idempotent(async (req, res, next) => {
      try {
        const cid = clientId(req);
        const body = z
          .object({ note: z.string().trim().max(4000).nullable().optional() })
          .parse(req.body ?? {});
        const job = await prisma.job.findFirst({ where: { id: req.params.jobId, clientId: cid } });
        if (!job) throw new ApiError(404, "not_found", "Job not found");

        // Already there: treat as success. This arrives from a phone that may
        // have been offline for hours, and a replayed tap shouldn't be an error.
        if (job.operational === to) {
          return res.json({ id: job.id, operational: job.operational, commercial: job.commercial });
        }
        if (!canMove(job.operational, to)) {
          throw new ApiError(
            400,
            "bad_transition",
            `Can't go from ${OPERATIONAL_LABEL[job.operational]} to ${OPERATIONAL_LABEL[to]}`
          );
        }

        const updated = await prisma.$transaction(async (tx) => {
          const next = await tx.job.update({
            where: { id: job.id },
            data: {
              operational: to,
              startedAt: to === "IN_PROGRESS" ? job.startedAt || new Date() : job.startedAt,
              completedAt: to === "COMPLETED" ? new Date() : job.completedAt,
              // Completing is what puts a job in front of the tradie as money
              // owed. Already-invoiced work keeps the state it earned.
              commercial:
                to === "COMPLETED" && !["INVOICE_SENT", "PAID"].includes(job.commercial)
                  ? "READY_TO_INVOICE"
                  : job.commercial,
            },
          });

          if (to === "ON_THE_WAY") {
            await tx.appointment.updateMany({
              where: { jobId: job.id, status: { in: ["SCHEDULED", "CONFIRMED"] } },
              data: { status: "ON_THE_WAY" },
            });
          }
          if (to === "COMPLETED") {
            await tx.appointment.updateMany({
              where: { jobId: job.id, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
              data: { status: "DONE", completedAt: new Date() },
            });
            if (body.note) {
              await tx.customerNote.create({
                data: {
                  clientId: cid,
                  jobId: job.id,
                  customerId: job.customerId,
                  propertyId: job.propertyId,
                  enquiryId: job.enquiryId,
                  type: "JOB",
                  body: body.note,
                },
              });
            }
          }

          await appendJobEvent(tx, {
            clientId: cid,
            jobId: job.id,
            type:
              to === "ON_THE_WAY" ? "visit.on_my_way" : to === "IN_PROGRESS" ? "job.started" : "job.completed",
            summary:
              to === "ON_THE_WAY"
                ? "On the way"
                : to === "IN_PROGRESS"
                  ? "Work started"
                  : "Job completed",
            payload: body.note ? { note: body.note } : undefined,
          });

          return next;
        });

        res.json({
          id: updated.id,
          operational: updated.operational,
          commercial: updated.commercial,
          primaryAction: primaryAction(updated),
        });
      } catch (err) {
        next(err);
      }
    })
  );
}

transitionRoute("on-my-way", "ON_THE_WAY");
transitionRoute("start", "IN_PROGRESS");
transitionRoute("complete", "COMPLETED");

// ---------------------------------------------------------------- costs

const costSchema = z.object({
  type: z.enum(["MATERIAL", "LABOUR", "EXPENSE", "SUBCONTRACTOR"]).default("MATERIAL"),
  label: z.string().trim().min(1).max(160),
  qty: z.number().min(0).default(1),
  unit: z.enum(["EACH", "HOUR", "DAY", "JOB", "METRE"]).default("JOB"),
  /** Ex-VAT. Null means not recorded yet, which is not the same as free. */
  unitCostPence: z.number().int().min(0).nullable().optional(),
  /** Ex-VAT. */
  sellPricePence: z.number().int().min(0).default(0),
  vatRate: z.number().min(0).max(100).default(20),
  billable: z.boolean().default(true),
  priceBookItemId: z.string().nullable().optional(),
  isExtra: z.boolean().default(false),
  agreedVia: z.string().trim().max(40).nullable().optional(),
  receiptFileId: z.string().nullable().optional(),
});

jobsRouter.get("/jobs/:jobId/costs", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const job = await prisma.job.findFirst({ where: { id: req.params.jobId, clientId: cid } });
    if (!job) throw new ApiError(404, "not_found", "Job not found");
    const [costs, client] = await Promise.all([
      getJobCosts(cid, job.id),
      prisma.client.findUnique({ where: { id: cid }, select: { labourCostPerHourPence: true } }),
    ]);
    res.json({
      costs,
      profit: computeProfit(job, costs, client?.labourCostPerHourPence ?? null),
      labourCostPerHourPence: client?.labourCostPerHourPence ?? null,
    });
  } catch (err) {
    next(err);
  }
});

jobsRouter.post(
  "/jobs/:jobId/costs",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const body = costSchema.parse(req.body ?? {});
      const job = await prisma.job.findFirst({ where: { id: req.params.jobId, clientId: cid } });
      if (!job) throw new ApiError(404, "not_found", "Job not found");

      const count = await prisma.jobCost.count({ where: { jobId: job.id } });
      const created = await prisma.$transaction(async (tx) => {
        const cost = await tx.jobCost.create({
          data: {
            clientId: cid,
            jobId: job.id,
            type: body.type,
            label: body.label,
            qty: body.qty,
            unit: body.unit,
            unitCostPence: body.unitCostPence ?? null,
            sellPricePence: body.sellPricePence,
            vatRate: body.vatRate,
            billable: body.billable,
            priceBookItemId: body.priceBookItemId ?? null,
            isExtra: body.isExtra,
            // An extra is recorded as agreed at the moment it's added, because
            // that is when the tradie stood in the kitchen and got a yes. The
            // record of the agreement is the valuable part, not a workflow.
            agreedAt: body.isExtra ? new Date() : null,
            agreedVia: body.isExtra ? (body.agreedVia ?? null) : null,
            receiptFileId: body.receiptFileId ?? null,
            source: body.priceBookItemId ? "BOOK" : "MANUAL",
            sort: count,
          },
        });

        await appendJobEvent(tx, {
          clientId: cid,
          jobId: job.id,
          type: body.isExtra ? "cost.extra_agreed" : "cost.added",
          summary: body.isExtra ? `Extra agreed: ${body.label}` : `Cost added: ${body.label}`,
          payload: { costId: cost.id, sellPricePence: body.sellPricePence },
        });

        return cost;
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.patch(
  "/jobs/:jobId/costs/:costId",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const body = costSchema.partial().parse(req.body ?? {});
      const cost = await prisma.jobCost.findFirst({
        where: { id: req.params.costId, jobId: req.params.jobId, clientId: cid },
      });
      if (!cost) throw new ApiError(404, "not_found", "Cost line not found");
      if (cost.invoicedAt) throw new ApiError(400, "invoiced", "That line is already on an invoice");

      const updated = await prisma.jobCost.update({
        where: { id: cost.id },
        data: {
          type: body.type,
          label: body.label,
          qty: body.qty,
          unit: body.unit,
          // `undefined` leaves it alone; explicit null clears it back to "not set".
          unitCostPence: body.unitCostPence === undefined ? undefined : body.unitCostPence,
          sellPricePence: body.sellPricePence,
          vatRate: body.vatRate,
          billable: body.billable,
          isExtra: body.isExtra,
          agreedVia: body.agreedVia,
          receiptFileId: body.receiptFileId,
        },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.delete(
  "/jobs/:jobId/costs/:costId",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const cost = await prisma.jobCost.findFirst({
        where: { id: req.params.costId, jobId: req.params.jobId, clientId: cid },
      });
      if (!cost) return res.json({ ok: true, id: req.params.costId, alreadyDeleted: true });
      if (cost.invoicedAt) throw new ApiError(400, "invoiced", "That line is already on an invoice");
      await prisma.jobCost.delete({ where: { id: cost.id } });
      res.json({ ok: true, id: cost.id });
    } catch (err) {
      next(err);
    }
  })
);

// ---------------------------------------------------------------- visits

jobsRouter.post(
  "/jobs/:jobId/visits",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const body = scheduleSchema.parse(req.body ?? {});
      const job = await loadJob(cid, req.params.jobId);
      const startsAt = new Date(body.startsAt);
      const endsAt = body.endsAt ? new Date(body.endsAt) : new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

      const visit = await prisma.appointment.create({
        data: {
          clientId: cid,
          jobId: job.id,
          enquiryId: job.enquiryId,
          title: body.kind ? `${job.title} — ${body.kind}` : job.title,
          kind: body.kind ?? null,
          notes: body.notes ?? null,
          startsAt,
          endsAt,
          arrivalWindowStart: body.arrivalWindowStart ? new Date(body.arrivalWindowStart) : null,
          arrivalWindowEnd: body.arrivalWindowEnd ? new Date(body.arrivalWindowEnd) : null,
          status: "SCHEDULED",
          address: job.property?.postcode || job.enquiry?.postcode || null,
          customerName: job.customer?.name || job.enquiry?.name || null,
          customerPhone: job.enquiry?.phone || null,
        },
      });

      await appendJobEvent(prisma, {
        clientId: cid,
        jobId: job.id,
        type: "job.scheduled",
        summary: `${body.kind || "Visit"} added for ${startsAt.toLocaleDateString("en-GB")}`,
        payload: { visitId: visit.id },
      });

      res.status(201).json(visit);
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.patch(
  "/jobs/:jobId/visits/:visitId",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const body = z
        .object({
          startsAt: z.string().datetime().optional(),
          endsAt: z.string().datetime().optional(),
          arrivalWindowStart: z.string().datetime().nullable().optional(),
          arrivalWindowEnd: z.string().datetime().nullable().optional(),
          kind: z.string().trim().max(40).nullable().optional(),
          notes: z.string().trim().max(2000).nullable().optional(),
          status: z.enum(["SCHEDULED", "CONFIRMED", "ON_THE_WAY", "DONE", "CANCELLED", "NO_SHOW"]).optional(),
        })
        .parse(req.body ?? {});
      const visit = await prisma.appointment.findFirst({
        where: { id: req.params.visitId, jobId: req.params.jobId, clientId: cid },
      });
      if (!visit) throw new ApiError(404, "not_found", "Visit not found");

      const updated = await prisma.appointment.update({
        where: { id: visit.id },
        data: {
          startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
          endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
          arrivalWindowStart:
            body.arrivalWindowStart === undefined ? undefined : body.arrivalWindowStart ? new Date(body.arrivalWindowStart) : null,
          arrivalWindowEnd:
            body.arrivalWindowEnd === undefined ? undefined : body.arrivalWindowEnd ? new Date(body.arrivalWindowEnd) : null,
          kind: body.kind,
          notes: body.notes,
          status: body.status,
          completedAt: body.status === "DONE" ? new Date() : undefined,
        },
      });

      if (body.startsAt && body.startsAt !== visit.startsAt.toISOString()) {
        await appendJobEvent(prisma, {
          clientId: cid,
          jobId: req.params.jobId,
          type: "job.rescheduled",
          summary: `Visit moved to ${updated.startsAt.toLocaleDateString("en-GB")}`,
          payload: { visitId: visit.id },
        });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  })
);

// ---------------------------------------------------------------- invoicing

jobsRouter.get("/jobs/:jobId/invoice/preview", requireClient, async (req, res, next) => {
  try {
    res.json(await previewJobInvoice(clientId(req), req.params.jobId));
  } catch (err) {
    next(err);
  }
});

jobsRouter.post(
  "/jobs/:jobId/invoice",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const invoice = await createInvoiceFromJob(clientId(req), req.params.jobId);
      res.status(201).json(invoice);
    } catch (err) {
      next(err);
    }
  })
);

// ---------------------------------------------------------------- arrival briefing

/**
 * What the tradie needs to know before knocking.
 *
 * The access code is *not* in this payload. It comes only from the deliberate
 * reveal endpoint, which writes an audit row — a briefing screen is opened on
 * every job, and a code that ships with it would be a code nobody chose to look
 * at, logged as if they had.
 */
jobsRouter.get("/jobs/:jobId/briefing", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, clientId: cid },
      include: {
        property: {
          include: {
            access: { select: accessSelect },
            assets: {
              orderBy: { createdAt: "asc" },
              select: { id: true, kind: true, name: true, model: true, location: true },
            },
          },
        },
        customer: { select: { id: true, name: true, preferredChannel: true, notes: true } },
        siteContact: { select: { id: true, name: true, phone: true, role: true } },
        enquiry: { select: { name: true, phone: true, postcode: true } },
        visits: { orderBy: { startsAt: "asc" }, take: 1 },
      },
    });
    if (!job) throw new ApiError(404, "not_found", "Job not found");

    const access = job.property?.access ?? null;
    res.json({
      jobId: job.id,
      title: job.title,
      customer: job.customer,
      siteContact: job.siteContact,
      phone: job.siteContact?.phone || job.enquiry?.phone || null,
      property: job.property
        ? {
            id: job.property.id,
            nickname: job.property.nickname,
            addressLine1: job.property.addressLine1,
            town: job.property.town,
            postcode: job.property.postcode,
          }
        : null,
      access: maskAccess(access),
      assets: job.property?.assets ?? [],
      nextVisit: job.visits[0] ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- activity

/**
 * Photos, certificates and receipts filed against this job.
 *
 * Also picks up anything filed against the job's property or its enquiry —
 * the gas certificate lives on the property, but the engineer standing in the
 * kitchen is looking at the job, and making him go and find it is how it stops
 * getting filed at all.
 */
jobsRouter.get("/jobs/:jobId/files", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const job = await prisma.job.findFirst({
      where: { id: req.params.jobId, clientId: cid },
      select: { id: true, enquiryId: true, propertyId: true, customerId: true },
    });
    if (!job) throw new ApiError(404, "not_found", "Job not found");

    const files = await prisma.customerFile.findMany({
      where: {
        clientId: cid,
        OR: [
          { jobId: job.id },
          ...(job.enquiryId ? [{ enquiryId: job.enquiryId }] : []),
          ...(job.propertyId ? [{ propertyId: job.propertyId }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json(
      files.map((f) => ({
        id: f.id,
        filename: f.filename,
        url: f.url,
        category: f.category,
        visibility: f.visibility,
        createdAt: f.createdAt,
        // So the UI can say where it came from rather than implying every file
        // was taken on this job.
        scope: f.jobId === job.id ? "job" : f.propertyId ? "property" : "customer",
      }))
    );
  } catch (err) {
    next(err);
  }
});

jobsRouter.get("/jobs/:jobId/events", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const job = await prisma.job.findFirst({ where: { id: req.params.jobId, clientId: cid } });
    if (!job) throw new ApiError(404, "not_found", "Job not found");
    res.json(await listJobEvents(cid, job.id));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------- voice / notes → draft quote

jobsRouter.post(
  "/jobs/:jobId/notes",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const body = z.object({ transcript: z.string().min(3).max(8000) }).parse(req.body ?? {});
      const enquiryId = await enquiryIdForJob(cid, req.params.jobId);
      await ensurePriceBook(cid);

      const voice = await prisma.voiceNote.create({
        data: { clientId: cid, enquiryId, transcript: body.transcript, status: "READY" },
      });
      const quote = await buildDraftQuoteFromTranscript({
        clientId: cid,
        enquiryId,
        voiceNoteId: voice.id,
        transcript: body.transcript,
      });
      res.status(201).json(quote);
    } catch (err) {
      next(err);
    }
  })
);

jobsRouter.post(
  "/jobs/:jobId/voice",
  requireClient,
  requireActiveAccount,
  idempotent(async (req, res, next) => {
    try {
      const cid = clientId(req);
      const body = z
        .object({
          contentType: z.string().min(3).max(40),
          dataBase64: z.string().min(10),
          durationSec: z.number().optional(),
        })
        .parse(req.body ?? {});
      const enquiryId = await enquiryIdForJob(cid, req.params.jobId);

      const b64 = body.dataBase64.includes(",")
        ? body.dataBase64.slice(body.dataBase64.indexOf(",") + 1)
        : body.dataBase64;
      const buf = Buffer.from(b64, "base64");
      const stored = await storeAudio(body.contentType, buf);

      const voice = await prisma.voiceNote.create({
        data: {
          clientId: cid,
          enquiryId,
          audioUrl: stored.url,
          status: "TRANSCRIBING",
          durationSec: body.durationSec ?? null,
        },
      });

      try {
        const filename = path.basename(stored.path || "job.webm");
        const fileBuf = stored.path ? await fs.readFile(stored.path) : buf;
        const transcript = await transcribeWithWhisper(fileBuf, filename, body.contentType);
        await ensurePriceBook(cid);
        const quote = await buildDraftQuoteFromTranscript({
          clientId: cid,
          enquiryId,
          voiceNoteId: voice.id,
          transcript,
        });
        res.status(201).json({ voiceNoteId: voice.id, transcript, quote });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Voice processing failed";
        await prisma.voiceNote.update({
          where: { id: voice.id },
          data: { status: "FAILED", error: msg.slice(0, 400) },
        });
        throw new ApiError(400, "voice_failed", msg);
      }
    } catch (err) {
      next(err);
    }
  })
);

// ---------------------------------------------------------------- messages

jobsRouter.get("/jobs/:jobId/messages", requireClient, async (req, res, next) => {
  try {
    const enquiryId = await enquiryIdForJob(clientId(req), req.params.jobId);
    const messages = await prisma.message.findMany({
      where: { enquiryId },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

jobsRouter.post("/jobs/:jobId/messages", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const body = z.object({ text: z.string().min(1).max(1200) }).parse(req.body ?? {});
    const enquiryId = await enquiryIdForJob(cid, req.params.jobId);
    const enquiry = await prisma.enquiry.findFirstOrThrow({ where: { id: enquiryId, clientId: cid } });

    const results = await sendMessage({ to: enquiry.phone, channel: "SMS", body: body.text });
    const logged = await logMessage({
      clientId: cid,
      enquiryId: enquiry.id,
      direction: "OUTBOUND",
      toAddr: enquiry.phone,
      body: body.text,
      twilioSid: results[0]?.id,
    });
    res.json({ ok: true, message: logged, deliverOk: results.some((r) => r.ok) });
  } catch (err) {
    next(err);
  }
});

/**
 * Quotes, voice notes and SMS all hang off the enquiry, not the job.
 *
 * Jobs migrated or promoted from the inbox share their enquiry's id, so the
 * lookup is usually a no-op — but a job booked direct still has one, and a job
 * created from a quote inherits the quote's. Resolving it here keeps every
 * caller from having to know that.
 */
async function enquiryIdForJob(cid: string, jobId: string): Promise<string> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, clientId: cid },
    select: { enquiryId: true },
  });
  if (!job) throw new ApiError(404, "not_found", "Job not found");
  if (!job.enquiryId) {
    throw new ApiError(400, "no_enquiry", "This job has no customer conversation attached");
  }
  return job.enquiryId;
}

export { netOf, newJobReference };
