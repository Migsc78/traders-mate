import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { generateRouteKey } from "../routing/routeKey.js";
import { generateSiteForLead } from "../services/site/generate.js";
import { extractPostcode } from "../services/geo/postcode.js";
import { createCheckoutSession } from "../services/billing/stripe.js";
import { sendMessage } from "../services/messaging/sender.js";
import {
  deactivatePriceBookItem,
  listPriceBook,
  savePriceBookItems,
  upsertPriceBookRows,
} from "../services/quotes/priceBook.js";

export const clientsRouter = Router();

// POST /api/clients/from-lead/:leadId  — convert a prospect into a paying client (CRM tenant)
const convertSchema = z.object({
  destPhone: z.string().min(6).optional(), // defaults to the lead's phone
  destChannel: z.enum(["WHATSAPP", "SMS", "BOTH"]).default("SMS"),
  allowedOrigins: z.array(z.string()).optional(),
});

clientsRouter.post("/from-lead/:leadId", async (req, res, next) => {
  try {
    const body = convertSchema.parse(req.body ?? {});
    const lead = await prisma.lead.findUnique({ where: { id: req.params.leadId } });
    if (!lead) throw new ApiError(404, "not_found", "Lead not found");

    // Idempotent: this lead may already have been converted (e.g. a double-click,
    // or the request retried). Return the existing client instead of duplicating it.
    const existing = await prisma.client.findUnique({ where: { leadId: lead.id } });
    if (existing) {
      const site = await siteInfoForLead(existing.leadId);
      return res.json({ ...existing, ...site, alreadyExisted: true });
    }

    const destPhone = body.destPhone ?? lead.phone ?? "";
    if (!destPhone) throw new ApiError(400, "no_phone", "No destination phone for this client");

    let client;
    try {
      client = await prisma.client.create({
        data: {
          leadId: lead.id,
          businessName: lead.displayName,
          tradeTitle: lead.occupation,
          town: lead.town,
          postcode: extractPostcode(lead.formattedAddress),
          routeKey: generateRouteKey(),
          destPhone,
          destChannel: body.destChannel,
          allowedOrigins: body.allowedOrigins ?? [],
          status: "ACTIVE",
        },
      });
    } catch (err) {
      // Race: two near-simultaneous conversions for the same lead. Whoever loses
      // the DB race just gets the winner's row instead of erroring out.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await prisma.client.findUnique({ where: { leadId: lead.id } });
        if (winner) {
          const site = await siteInfoForLead(winner.leadId);
          return res.json({ ...winner, ...site, alreadyExisted: true });
        }
      }
      throw err;
    }

    let siteRegenerated = false;
    let previewUrl: string | undefined;
    if ((lead.siteGeneratedAt || lead.siteSlug) && lead.phone) {
      try {
        const result = await generateSiteForLead(lead);
        siteRegenerated = true;
        previewUrl = result.previewUrl;
        await prisma.lead.update({
          where: { id: lead.id },
          data: { outreachStatus: "SOLD", siteSlug: result.slug, siteGeneratedAt: new Date() },
        });
      } catch (err) {
        console.warn("[clients] site regen after convert failed", err instanceof Error ? err.message : err);
        await prisma.lead.update({ where: { id: lead.id }, data: { outreachStatus: "SOLD" } });
      }
    } else {
      await prisma.lead.update({ where: { id: lead.id }, data: { outreachStatus: "SOLD" } });
    }

    res.json({ ...client, siteRegenerated, previewUrl });
  } catch (err) {
    next(err);
  }
});

// POST /api/clients — manually add a client that didn't come from the lead engine
const createSchema = z.object({
  businessName: z.string().min(1),
  tradeTitle: z.string().optional(),
  town: z.string().optional(),
  postcode: z.string().optional(),
  destPhone: z.string().min(6),
  destChannel: z.enum(["WHATSAPP", "SMS", "BOTH"]).default("SMS"),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]).default("ACTIVE"),
});

clientsRouter.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body ?? {});
    const client = await prisma.client.create({
      data: {
        businessName: body.businessName,
        tradeTitle: body.tradeTitle,
        town: body.town,
        postcode: body.postcode ? extractPostcode(body.postcode) ?? body.postcode.trim().toUpperCase() : null,
        routeKey: generateRouteKey(),
        destPhone: body.destPhone,
        destChannel: body.destChannel,
        status: body.status,
      },
    });
    res.status(201).json(client);
  } catch (err) {
    next(err);
  }
});

async function siteInfoForLead(leadId: string | null | undefined) {
  if (!leadId) return { siteSlug: null as string | null, sitePreviewUrl: null as string | null };
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { siteSlug: true },
  });
  const siteSlug = lead?.siteSlug ?? null;
  return {
    siteSlug,
    sitePreviewUrl: siteSlug ? `/sites/${siteSlug}/` : null,
  };
}

// GET /api/clients — list with a 30-day enquiry count for the ROI panel
clientsRouter.get("/", async (_req, res, next) => {
  try {
    const clients = await prisma.client.findMany({ orderBy: { createdAt: "desc" } });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const withCounts = await Promise.all(
      clients.map(async (c) => {
        const [leads30, held, site] = await Promise.all([
          prisma.enquiry.count({ where: { clientId: c.id, createdAt: { gte: since } } }),
          prisma.enquiry.count({ where: { clientId: c.id, status: "HELD" } }),
          siteInfoForLead(c.leadId),
        ]);
        return { ...c, leads30, heldTotal: held, ...site };
      })
    );
    res.json(withCounts);
  } catch (err) {
    next(err);
  }
});

const idsSchema = z.object({ ids: z.array(z.string()).min(1) });

// POST /api/clients/bulk/delete — remove several clients at once
clientsRouter.post("/bulk/delete", async (req, res, next) => {
  try {
    const { ids } = idsSchema.parse(req.body ?? {});
    const result = await prisma.client.deleteMany({ where: { id: { in: ids } } });
    res.json({ deleted: result.count });
  } catch (err) {
    next(err);
  }
});

// POST /api/clients/bulk/status — set status for several clients at once (e.g. suspend/reactivate)
const bulkStatusSchema = z.object({
  ids: z.array(z.string()).min(1),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]),
});
clientsRouter.post("/bulk/status", async (req, res, next) => {
  try {
    const { ids, status } = bulkStatusSchema.parse(req.body ?? {});
    const result = await prisma.client.updateMany({ where: { id: { in: ids } }, data: { status } });
    res.json({ updated: result.count });
  } catch (err) {
    next(err);
  }
});

// Create a billing checkout link and text it to the tradie. Best-effort on the SMS leg —
// the caller still gets the link back even if delivery fails, so it can be copied manually.
async function sendInvoiceLink(clientId: string): Promise<{ url: string; stub: boolean; delivered: boolean }> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new ApiError(404, "not_found", "Client not found");

  const session = await createCheckoutSession({ clientId: client.id });
  let delivered = false;
  try {
    const body = `Hi ${client.businessName}, here's your TradiesMate billing link — please complete payment to keep leads flowing: ${session.url}`;
    const results = await sendMessage({ to: client.destPhone, channel: client.destChannel, body });
    delivered = results.some((r) => r.ok);
  } catch (err) {
    console.warn("[clients] send-invoice SMS failed", err instanceof Error ? err.message : err);
  }
  return { ...session, delivered };
}

// POST /api/clients/bulk/send-invoice — text several tradies a billing link at once
clientsRouter.post("/bulk/send-invoice", async (req, res, next) => {
  try {
    const { ids } = idsSchema.parse(req.body ?? {});
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await sendInvoiceLink(id);
          return { id, ok: true, delivered: r.delivered };
        } catch (err) {
          return { id, ok: false, error: err instanceof Error ? err.message : "failed" };
        }
      })
    );
    res.json({ sent: results.filter((r) => r.ok).length, results });
  } catch (err) {
    next(err);
  }
});

// GET /api/clients/:id — client + recent enquiries + monthly count
clientsRouter.get("/:id", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const enquiries = await prisma.enquiry.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const leads30 = enquiries.filter((e) => e.createdAt >= since).length;
    const site = await siteInfoForLead(client.leadId);
    res.json({ ...client, enquiries, leads30, ...site });
  } catch (err) {
    next(err);
  }
});

// POST /api/clients/:id/rebuild-site — regenerate demo site with this client's routeKey
clientsRouter.post("/:id/rebuild-site", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    if (!client.leadId) throw new ApiError(400, "no_lead", "This client has no linked lead to build a demo site from");

    const lead = await prisma.lead.findUnique({ where: { id: client.leadId } });
    if (!lead) throw new ApiError(404, "not_found", "Linked lead not found");
    if (!lead.phone) throw new ApiError(400, "no_phone", "Lead has no phone number");

    const result = await generateSiteForLead(lead);
    await prisma.lead.update({
      where: { id: lead.id },
      data: { siteSlug: result.slug, siteGeneratedAt: new Date() },
    });

    res.json({
      slug: result.slug,
      previewUrl: result.previewUrl,
      sitePreviewUrl: result.previewUrl,
      siteSlug: result.slug,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/clients/:id — remove a client (and its enquiries, cascaded)
clientsRouter.delete("/:id", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/clients/:id/send-invoice — text the tradie a Stripe billing/checkout link
clientsRouter.post("/:id/send-invoice", async (req, res, next) => {
  try {
    res.json(await sendInvoiceLink(req.params.id));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/clients/:id — edit routing, status, custom messages
const patchSchema = z.object({
  businessName: z.string().optional(),
  tradeTitle: z.string().optional(),
  town: z.string().optional(),
  postcode: z.string().nullable().optional(),
  destPhone: z.string().optional(),
  destChannel: z.enum(["WHATSAPP", "SMS", "BOTH"]).optional(),
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]).optional(),
  allowedOrigins: z.array(z.string()).optional(),
  tradieNotifyTpl: z.string().nullable().optional(),
  customerAckTpl: z.string().nullable().optional(),
});

clientsRouter.patch("/:id", async (req, res, next) => {
  try {
    const patch = patchSchema.parse(req.body ?? {});
    if (patch.postcode !== undefined) {
      patch.postcode = patch.postcode ? extractPostcode(patch.postcode) ?? patch.postcode.trim().toUpperCase() : null;
    }
    const client = await prisma.client.update({ where: { id: req.params.id }, data: patch });
    res.json(client);
  } catch (err) {
    next(err);
  }
});

const priceBookItemSchema = z.object({
  id: z.string().optional(),
  sku: z.string().nullable().optional(),
  label: z.string().min(1),
  unit: z.enum(["EACH", "HOUR", "DAY", "JOB", "METRE"]),
  unitPricePence: z.number().int().min(0),
  vatRate: z.number().min(0).max(100).default(20),
  isCallout: z.boolean().optional(),
  active: z.boolean().optional(),
});

const importRowSchema = z.object({
  sku: z.string().nullable().optional(),
  label: z.string().min(1),
  unit: z.string().optional(),
  unitPriceGbp: z.number().optional(),
  unitPricePence: z.number().int().min(0).optional(),
  vatRate: z.number().min(0).max(100).optional(),
  isCallout: z.boolean().optional(),
  active: z.boolean().optional(),
});

// GET /api/clients/:id/price-book
clientsRouter.get("/:id/price-book", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    res.json(await listPriceBook(client.id));
  } catch (err) {
    next(err);
  }
});

// PUT /api/clients/:id/price-book
clientsRouter.put("/:id/price-book", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const body = z.object({ items: z.array(priceBookItemSchema) }).parse(req.body ?? {});
    res.json(await savePriceBookItems(client.id, body.items));
  } catch (err) {
    next(err);
  }
});

// POST /api/clients/:id/price-book/import
clientsRouter.post("/:id/price-book/import", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const body = z.object({ rows: z.array(importRowSchema).max(500) }).parse(req.body ?? {});
    res.json(await upsertPriceBookRows(client.id, body.rows));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/clients/:id/price-book/:itemId — soft-deactivate
clientsRouter.delete("/:id/price-book/:itemId", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const row = await deactivatePriceBookItem(client.id, req.params.itemId);
    if (!row) throw new ApiError(404, "not_found", "Price book item not found");
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// GET /api/clients/:id/quotes — recent quotes for CRM
clientsRouter.get("/:id/quotes", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const quotes = await prisma.quote.findMany({
      where: { clientId: client.id, status: { not: "DELETED" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        enquiry: { select: { id: true, name: true, phone: true } },
        lines: { orderBy: { sort: "asc" }, take: 8 },
      },
    });
    res.json(quotes);
  } catch (err) {
    next(err);
  }
});

const assetKindSchema = z.enum(["LOGO", "SHOWCASE", "JOB", "OTHER"]);

// GET /api/clients/:id/assets
clientsRouter.get("/:id/assets", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const assets = await prisma.clientAsset.findMany({
      where: { clientId: client.id },
      orderBy: [{ kind: "asc" }, { sort: "asc" }, { createdAt: "desc" }],
    });
    res.json(assets);
  } catch (err) {
    next(err);
  }
});

// POST /api/clients/:id/assets — upload image (base64)
clientsRouter.post("/:id/assets", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.id } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const body = z
      .object({
        kind: assetKindSchema.default("SHOWCASE"),
        contentType: z.string().min(3).max(40),
        dataBase64: z.string().min(10),
        caption: z.string().max(200).optional(),
        filename: z.string().max(120).optional(),
      })
      .parse(req.body ?? {});

    const { storeImage } = await import("../services/storage/store.js");
    const b64 = body.dataBase64.includes(",")
      ? body.dataBase64.slice(body.dataBase64.indexOf(",") + 1)
      : body.dataBase64;
    const buf = Buffer.from(b64, "base64");
    const stored = await storeImage(body.contentType, buf);

    // Only one active logo — demote previous logos to SHOWCASE
    if (body.kind === "LOGO") {
      await prisma.clientAsset.updateMany({
        where: { clientId: client.id, kind: "LOGO" },
        data: { kind: "SHOWCASE" },
      });
    }

    const asset = await prisma.clientAsset.create({
      data: {
        clientId: client.id,
        kind: body.kind,
        url: stored.url,
        filename: body.filename || null,
        caption: body.caption || null,
      },
    });
    res.status(201).json(asset);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/clients/:id/assets/:assetId
clientsRouter.patch("/:id/assets/:assetId", async (req, res, next) => {
  try {
    const existing = await prisma.clientAsset.findFirst({
      where: { id: req.params.assetId, clientId: req.params.id },
    });
    if (!existing) throw new ApiError(404, "not_found", "Asset not found");
    const body = z
      .object({
        kind: assetKindSchema.optional(),
        caption: z.string().max(200).nullable().optional(),
        sort: z.number().int().optional(),
      })
      .parse(req.body ?? {});

    if (body.kind === "LOGO") {
      await prisma.clientAsset.updateMany({
        where: { clientId: existing.clientId, kind: "LOGO", NOT: { id: existing.id } },
        data: { kind: "SHOWCASE" },
      });
    }

    const asset = await prisma.clientAsset.update({
      where: { id: existing.id },
      data: {
        kind: body.kind,
        caption: body.caption === undefined ? undefined : body.caption,
        sort: body.sort,
      },
    });
    res.json(asset);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/clients/:id/assets/:assetId
clientsRouter.delete("/:id/assets/:assetId", async (req, res, next) => {
  try {
    const existing = await prisma.clientAsset.findFirst({
      where: { id: req.params.assetId, clientId: req.params.id },
    });
    if (!existing) throw new ApiError(404, "not_found", "Asset not found");
    await prisma.clientAsset.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
