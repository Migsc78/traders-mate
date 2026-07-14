import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { toCsv } from "../utils/csv.js";
import { ApiError } from "../middleware/error.js";
import { getPlace } from "../services/places.js";
import { processPlace, toDbData } from "../services/pipeline.js";

export const leadsRouter = Router();

const csvList = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

async function refreshLeadById(id: string) {
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "not_found", "Lead not found");

  const place = await getPlace(existing.placeId);
  if (!place) throw new ApiError(404, "place_gone", "Place no longer available on Google");

  const reprocessed = await processPlace({ ...place, id: existing.placeId }, existing.occupation, existing.town);
  const data = toDbData(reprocessed);
  return prisma.lead.update({
    where: { id: existing.id },
    data: {
      ...(({ email: _e, ...rest }) => rest)(data),
      ...(data.email ? { email: data.email } : {}),
      lastFetchedAt: new Date(),
    },
  });
}

const listQuery = z.object({
  websiteClass: z.string().optional(),
  minReviews: z.coerce.number().optional(),
  minRating: z.coerce.number().optional(),
  minScore: z.coerce.number().optional(),
  occupation: z.string().optional(),
  town: z.string().optional(),
  status: z.string().optional(),
  searchRunId: z.string().optional(),
  qualified: z
    .string()
    .optional()
    .transform((v) => (v == null ? true : v === "true")),
  sort: z.enum(["priorityScore", "rating", "userRatingCount", "createdAt"]).default("priorityScore"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(50),
});

// Structural where-object; validated against the generated Prisma types at the call site.
type LeadWhere = Record<string, unknown>;

function buildWhere(q: z.infer<typeof listQuery>): LeadWhere {
  const where: LeadWhere = {};
  if (q.qualified !== undefined) where.qualified = q.qualified;
  const classes = csvList(q.websiteClass);
  if (classes?.length) {
    (where as Record<string, unknown>).websiteClass = { in: classes };
  }
  if (q.minReviews != null) where.userRatingCount = { gte: q.minReviews };
  if (q.minRating != null) where.rating = { gte: q.minRating };
  if (q.minScore != null) where.priorityScore = { gte: q.minScore };
  if (q.occupation) where.occupation = { contains: q.occupation, mode: "insensitive" };
  if (q.town) where.town = { contains: q.town, mode: "insensitive" };
  if (q.status) (where as Record<string, unknown>).outreachStatus = q.status;
  if (q.searchRunId) where.searchRunId = q.searchRunId;
  return where;
}

// GET /api/leads
leadsRouter.get("/", async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where = buildWhere(q) as any;
    const [data, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { [q.sort]: q.order },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.lead.count({ where }),
    ]);
    res.json({ data, total, page: q.page, pageSize: q.pageSize });
  } catch (err) {
    next(err);
  }
});

const bulkIdsSchema = z.object({ ids: z.array(z.string()).min(1).max(100) });

const exportSchema = z.object({
  ids: z.array(z.string()).optional(),
});

const EXPORT_COLUMNS = [
  "displayName",
  "occupation",
  "town",
  "phone",
  "email",
  "primaryType",
  "editorialSummary",
  "openingHours",
  "websiteClass",
  "websiteUri",
  "rating",
  "userRatingCount",
  "priorityScore",
  "domainSuggested",
  "domainAvailable",
  "affiliateUrl",
  "googleMapsUri",
  "lastFetchedAt",
  "outreachStatus",
  "notes",
] as const;

// Static POST routes before /:id — otherwise "bulk" is captured as :id
leadsRouter.post("/bulk/refresh", async (req, res, next) => {
  try {
    const { ids } = bulkIdsSchema.parse(req.body);
    let refreshed = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await refreshLeadById(id);
        refreshed += 1;
      } catch (err) {
        const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Refresh failed";
        errors.push(message);
      }
    }

    res.json({ refreshed, failed: ids.length - refreshed, errors: errors.length ? errors : undefined });
  } catch (err) {
    next(err);
  }
});

leadsRouter.post("/bulk/mark-screened", async (req, res, next) => {
  try {
    const { ids } = bulkIdsSchema.parse(req.body);
    const now = new Date();
    const result = await prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { tpsCheckedAt: now, outreachStatus: "SCREENED" },
    });
    res.json({ updated: result.count });
  } catch (err) {
    next(err);
  }
});

leadsRouter.post("/export", async (req, res, next) => {
  try {
    const { ids } = exportSchema.parse(req.body ?? {});
    const where = ids?.length ? { id: { in: ids } } : { qualified: true };
    const leads = await prisma.lead.findMany({ where, orderBy: { priorityScore: "desc" } });
    const csv = toCsv(leads as unknown as Record<string, unknown>[], EXPORT_COLUMNS as unknown as string[]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id
leadsRouter.get("/:id", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) throw new ApiError(404, "not_found", "Lead not found");
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id
const patchSchema = z.object({
  outreachStatus: z
    .enum(["NEW", "SCREENED", "CONTACTED", "INTERESTED", "DEMO_SENT", "SOLD", "DEAD", "DO_NOT_CONTACT"])
    .optional(),
  notes: z.string().max(5000).optional(),
  email: z.string().email().max(200).or(z.literal("")).optional(),
  tpsCheckedAt: z.coerce.date().nullable().optional(),
});

leadsRouter.patch("/:id", async (req, res, next) => {
  try {
    const patch = patchSchema.parse(req.body);
    const data = {
      ...patch,
      ...(patch.email === "" ? { email: null } : {}),
    };
    const lead = await prisma.lead.update({ where: { id: req.params.id }, data });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// POST /api/leads/:id/refresh
leadsRouter.post("/:id/refresh", async (req, res, next) => {
  try {
    const updated = await refreshLeadById(req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
