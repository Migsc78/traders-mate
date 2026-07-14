import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { generateSiteForLead } from "../services/site/generate.js";
import type { SiteOverrides } from "../services/site/siteData.js";

export const sitesRouter = Router();

const serviceSchema = z.object({ title: z.string(), desc: z.string() });
const reviewSchema = z.object({ name: z.string(), text: z.string(), rating: z.number().min(1).max(5) });

const overridesSchema = z
  .object({
    email: z.string().email().optional(),
    whatsapp: z.string().optional(),
    tagline: z.string().optional(),
    heroSub: z.string().optional(),
    about: z.string().optional(),
    services: z.array(serviceSchema).optional(),
    areas: z.array(z.string()).optional(),
    reviews: z.array(reviewSchema).optional(),
    primaryColor: z.string().optional(),
    accentColor: z.string().optional(),
    domain: z.string().optional(),
  })
  .default({});

// POST /api/leads/:id/site  -> generate (or regenerate) the site for a lead
sitesRouter.post("/:id/site", async (req, res, next) => {
  try {
    const overrides = overridesSchema.parse(req.body ?? {}) as SiteOverrides;
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) throw new ApiError(404, "not_found", "Lead not found");
    if (!lead.phone) throw new ApiError(400, "no_phone", "Lead has no phone number to put on the site");

    const result = await generateSiteForLead(lead, overrides);

    await prisma.lead.update({
      where: { id: lead.id },
      data: { siteSlug: result.slug, siteGeneratedAt: new Date() },
    });

    res.json({ slug: result.slug, previewUrl: result.previewUrl });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads/:id/site/html -> raw HTML (for download)
sitesRouter.get("/:id/site/html", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!lead) throw new ApiError(404, "not_found", "Lead not found");
    if (!lead.phone) throw new ApiError(400, "no_phone", "Lead has no phone number");

    const result = await generateSiteForLead(lead);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.slug}.html"`);
    res.send(result.html);
  } catch (err) {
    next(err);
  }
});
