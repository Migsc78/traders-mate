import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { routeDecision, buildTradieMessage, buildCustomerAck, type ClientStatus } from "../services/messaging/render.js";
import { sendMessage, toE164UK } from "../services/messaging/sender.js";
import { distanceMilesBetween, normalizePostcode } from "../services/geo/postcode.js";
import { appPublicUrl, createMagicLogin } from "../services/quotes/magicAuth.js";

// ---- Public lead intake (cross-origin; gated by routeKey + subscription) ----
export const intakeRouter = Router();

const limiter = rateLimit({
  windowMs: env.INTAKE_RATE_WINDOW_MS,
  max: env.INTAKE_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many requests" } },
});

const intakeSchema = z.object({
  routeKey: z.string().min(3).max(40),
  name: z.string().min(1).max(120),
  phone: z.string().min(5).max(40),
  message: z.string().max(2000).optional(),
  postcode: z.string().max(12).optional(),
  photos: z.array(z.string().url()).max(6).optional(),
  source: z.enum(["site", "widget", "hosted", "qr"]).default("site"),
  company: z.string().optional(), // honeypot — real users never fill this
});

// Deliver a routed enquiry to the tradie + auto-ack the customer. Best-effort, async.
async function deliver(clientId: string, enquiryId: string): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  const enquiry = await prisma.enquiry.findUnique({ where: { id: enquiryId } });
  if (!client || !enquiry) return;

  // Best-effort — if either postcode is missing/unrecognised we just omit the distance.
  const distanceMiles = enquiry.postcode ? await distanceMilesBetween(client.postcode, enquiry.postcode) : null;
  if (distanceMiles != null && distanceMiles !== enquiry.distanceMiles) {
    await prisma.enquiry.update({ where: { id: enquiry.id }, data: { distanceMiles } });
  }

  const vars = {
    name: enquiry.name,
    phone: enquiry.phone,
    message: enquiry.message,
    business: client.businessName,
    town: client.town,
    photos: enquiry.photoUrls,
    postcode: enquiry.postcode,
    distanceMiles,
  };

  const tradieBody = buildTradieMessage(client.tradieNotifyTpl, vars);
  // Additive deep link for quoting — core SMS content unchanged above.
  let bodyWithLink = tradieBody;
  try {
    const magic = await createMagicLogin(client.id);
    const next = encodeURIComponent(`/t/jobs/${enquiry.id}`);
    bodyWithLink = `${tradieBody}\n\nQuote this job: ${magic.url}&next=${next}`;
  } catch {
    bodyWithLink = `${tradieBody}\n\nOpen jobs: ${appPublicUrl()}/t`;
  }
  const results = await sendMessage({ to: client.destPhone, channel: client.destChannel, body: bodyWithLink });
  const ok = results.some((r) => r.ok);

  // Best-effort acknowledgement to the customer (SMS to the number they gave).
  try {
    await sendMessage({ to: enquiry.phone, channel: "SMS", body: buildCustomerAck(client.customerAckTpl, vars) });
  } catch {
    /* non-fatal */
  }

  await prisma.enquiry.update({
    where: { id: enquiry.id },
    data: {
      status: ok ? "ROUTED" : "FAILED",
      deliveredAt: ok ? new Date() : null,
      deliveryInfo: results.map((r) => `${r.via}:${r.ok ? "ok" : r.error}`).join("; ").slice(0, 500),
    },
  });
}

intakeRouter.post("/", limiter, async (req, res, next) => {
  try {
    const body = intakeSchema.parse(req.body ?? {});
    if (body.company && body.company.trim()) {
      return res.json({ ok: true }); // silently drop bots
    }

    const client = await prisma.client.findUnique({ where: { routeKey: body.routeKey } });
    if (!client) {
      return res.status(404).json({ error: { code: "unknown_site", message: "Unknown site key" } });
    }

    const decision = routeDecision(client.status as ClientStatus);
    const enquiry = await prisma.enquiry.create({
      data: {
        clientId: client.id,
        name: body.name,
        phone: body.phone,
        message: body.message ?? null,
        postcode: normalizePostcode(body.postcode) ?? null,
        photoUrls: body.photos ?? [],
        source: body.source,
        status: decision === "ROUTED" ? "ROUTED" : "HELD",
      },
    });

    // Respond immediately; deliver in the background.
    res.json({ ok: true, held: decision === "HELD" });

    if (decision === "ROUTED") {
      void deliver(client.id, enquiry.id).catch((e) => console.error("[intake] deliver failed", e));
    }
  } catch (err) {
    next(err);
  }
});

// ---- Gated call / WhatsApp redirects (keep the number out of the HTML) ----
export const redirectRouter = Router();

function unavailablePage(res: import("express").Response) {
  res
    .status(200)
    .type("html")
    .send(
      "<!doctype html><meta charset=utf-8><title>Temporarily unavailable</title>" +
        "<div style='font-family:sans-serif;max-width:420px;margin:80px auto;text-align:center;color:#334'>" +
        "<h2>Temporarily unavailable</h2><p>Please try again shortly.</p></div>"
    );
}

redirectRouter.get("/:routeKey/call", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { routeKey: req.params.routeKey } });
    if (!client || client.status !== "ACTIVE") return unavailablePage(res);
    res.redirect(302, "tel:" + toE164UK(client.destPhone));
  } catch (err) {
    next(err);
  }
});

redirectRouter.get("/:routeKey/whatsapp", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { routeKey: req.params.routeKey } });
    if (!client || client.status !== "ACTIVE") return unavailablePage(res);
    const num = toE164UK(client.destPhone).replace(/[^\d]/g, "");
    const text = encodeURIComponent(`Hi ${client.businessName}, I'd like a quote please.`);
    res.redirect(302, `https://wa.me/${num}?text=${text}`);
  } catch (err) {
    next(err);
  }
});
