import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { isProduction } from "../lib/production.js";
import { ApiError } from "../middleware/error.js";
import { sendMessage } from "../services/messaging/sender.js";
import { logMessage } from "../services/messaging/log.js";
import { createMagicLogin, appPublicUrl } from "../services/quotes/magicAuth.js";

export const inboundEmailRouter = Router();

/**
 * Generic inbound email webhook (Postmark/SendGrid-style).
 * Expects JSON: { to, from, subject, text, secret? }
 * Local-part of `to` must match Client.inboundEmailLocal.
 */
inboundEmailRouter.post("/", async (req, res, next) => {
  try {
    const body = z
      .object({
        to: z.string().email().or(z.string().min(3)),
        from: z.string().min(3),
        subject: z.string().optional(),
        text: z.string().optional(),
        html: z.string().optional(),
        secret: z.string().optional(),
      })
      .parse(req.body ?? {});

    const expectedSecret = env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim() || "";
    if (isProduction() && !expectedSecret) {
      throw new ApiError(503, "misconfigured", "Inbound email webhook secret not configured");
    }
    if (expectedSecret) {
      const hdr = String(req.headers["x-inbound-secret"] || body.secret || "");
      if (hdr !== expectedSecret) {
        throw new ApiError(401, "unauthorized", "Bad inbound email secret");
      }
    }

    const toAddr = body.to.includes("<") ? (body.to.match(/<([^>]+)>/)?.[1] || body.to) : body.to;
    const local = toAddr.split("@")[0]?.toLowerCase();
    if (!local) throw new ApiError(400, "bad_to", "Missing recipient");

    const client = await prisma.client.findUnique({ where: { inboundEmailLocal: local } });
    if (!client) throw new ApiError(404, "not_found", "No client for this inbox");

    const fromEmail = body.from.includes("<") ? body.from.match(/<([^>]+)>/)?.[1] || body.from : body.from;
    const fromName = body.from.includes("<") ? body.from.split("<")[0].trim().replace(/"/g, "") : fromEmail.split("@")[0];
    const message = [body.subject ? `Subject: ${body.subject}` : null, body.text || stripHtml(body.html || "")]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 4000);

    const enquiry = await prisma.enquiry.create({
      data: {
        clientId: client.id,
        name: fromName || "Email enquiry",
        phone: client.destPhone, // placeholder — tradie can update; email-only leads lack phone
        message,
        source: "email",
        status: client.status === "ACTIVE" || client.status === "TRIAL" ? "ROUTED" : "HELD",
        deliveredAt: new Date(),
        deliveryInfo: `from:${fromEmail}`,
      },
    });

    await logMessage({
      clientId: client.id,
      enquiryId: enquiry.id,
      direction: "INBOUND",
      channel: "EMAIL",
      toAddr: toAddr,
      fromAddr: fromEmail,
      body: message.slice(0, 2000),
      status: "received",
    });

    const { url } = await createMagicLogin(client.id);
    const deep = `${appPublicUrl()}/t/jobs/${enquiry.id}`;
    const notify = `New email enquiry from ${fromName || fromEmail}.\n\nOpen: ${deep}\nLogin: ${url}`;
    await sendMessage({ to: client.destPhone, channel: client.destChannel, body: notify });

    res.json({ ok: true, enquiryId: enquiry.id });
  } catch (err) {
    next(err);
  }
});

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
