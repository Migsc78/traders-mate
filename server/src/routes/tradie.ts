import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { sendMessage, toE164UK, twilioConfigured } from "../services/messaging/sender.js";
import { storeAudio } from "../services/storage/store.js";
import { createMagicLogin, createClientSession, resolveSession, appPublicUrl } from "../services/quotes/magicAuth.js";
import {
  deactivatePriceBookItem,
  ensurePriceBook,
  listPriceBook,
  quoteLineInclude,
  savePriceBookItems,
  upsertPriceBookRows,
} from "../services/quotes/priceBook.js";
import { buildDraftQuoteFromTranscript, recomputeQuoteTotals } from "../services/quotes/draft.js";
import { scheduleQuoteFollowUps, cancelQuoteFollowUps } from "../services/quotes/followups.js";
import { formatGbp } from "../services/quotes/money.js";
import { transcribeWithWhisper } from "../services/quotes/whisper.js";
import { claudeConfigured, openaiConfigured } from "../settings.js";
import { logMessage } from "../services/messaging/log.js";
import { createCheckoutSession } from "../services/billing/stripe.js";
import { createInvoiceFromQuote, sendInvoice, markInvoicePaid } from "../services/invoices/invoice.js";
import { env } from "../env.js";
import { configureNumberWebhooks, getNumberWebhookStatus } from "../services/twilio/numbers.js";
import { extractPostcode, normalizePostcode } from "../services/geo/postcode.js";

export const tradieRouter = Router();

const magicLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const phone = String(req.body?.phone || "")
      .replace(/\D/g, "")
      .slice(-10);
    const key = String(req.body?.routeKey || phone || req.ip || "unknown");
    return `magic:${key}`;
  },
  message: { error: { code: "rate_limited", message: "Too many login link requests — try again later." } },
});

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)tm_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Paid-trial gate: TRIAL is only active after Stripe starter checkout (stripeCustomerId set)
 * and before trialEndsAt. Unpaid signups can browse but cannot send quotes/SMS.
 */
function accountActive(
  status: string,
  trialEndsAt: Date | null | undefined,
  stripeCustomerId?: string | null
): boolean {
  if (status === "ACTIVE" || status === "PAST_DUE") return true;
  if (status === "TRIAL") {
    if (!stripeCustomerId) return false;
    if (!trialEndsAt) return true;
    return trialEndsAt.getTime() > Date.now();
  }
  return false;
}

async function requireClient(req: Request, _res: Response, next: NextFunction) {
  try {
    const session = await resolveSession(bearer(req));
    if (!session) throw new ApiError(401, "unauthorized", "Sign in via magic link");
    (req as Request & { clientId: string }).clientId = session.clientId;
    next();
  } catch (err) {
    next(err);
  }
}

/** Blocks mutating quote/invoice actions when trial expired / suspended. */
async function requireActiveAccount(req: Request, _res: Response, next: NextFunction) {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    if (!accountActive(client.status, client.trialEndsAt, client.stripeCustomerId)) {
      throw new ApiError(
        402,
        "subscription_required",
        client.stripeCustomerId
          ? "Trial ended or account inactive — manage billing in Settings"
          : "Pay £14 to start your 14-day trial — open Billing in Settings"
      );
    }
    next();
  } catch (err) {
    next(err);
  }
}

function clientId(req: Request): string {
  return (req as Request & { clientId: string }).clientId;
}

// ---- Auth (public) ----
tradieRouter.post("/auth/magic", magicLoginLimiter, async (req, res, next) => {
  try {
    const body = z.object({ routeKey: z.string().min(3).optional(), phone: z.string().min(6).optional() }).parse(req.body ?? {});
    if (!body.routeKey && !body.phone) throw new ApiError(400, "missing", "Provide routeKey or phone");

    const client = body.routeKey
      ? await prisma.client.findUnique({ where: { routeKey: body.routeKey } })
      : await prisma.client.findFirst({
          where: { destPhone: { contains: body.phone!.replace(/\D/g, "").slice(-10) } },
          orderBy: { createdAt: "desc" },
        });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    if (client.status === "CANCELLED") throw new ApiError(403, "cancelled", "Account cancelled");

    const { url } = await createMagicLogin(client.id);
    await sendMessage({
      to: client.destPhone,
      channel: client.destChannel,
      body: `Your TradiesMate login link (expires in 30 min):\n${url}`,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** Direct login for seed test accounts only (`seed_tm_*` route keys) — no SMS. */
tradieRouter.post("/auth/seed-login", async (req, res, next) => {
  try {
    const body = z.object({ routeKey: z.string().min(3) }).parse(req.body ?? {});
    const routeKey = body.routeKey.trim();
    if (!routeKey.startsWith("seed_tm_")) {
      throw new ApiError(403, "forbidden", "Direct login is only available for seed test accounts");
    }
    const client = await prisma.client.findUnique({ where: { routeKey } });
    if (!client) throw new ApiError(404, "not_found", "Seed client not found — run npm run db:seed");
    if (client.status === "CANCELLED") throw new ApiError(403, "cancelled", "Account cancelled");

    const session = await createClientSession(client.id);
    await ensurePriceBook(client.id, client.tradeTitle);
    res.json({
      sessionToken: session.sessionToken,
      clientId: client.id,
      routeKey: client.routeKey,
      businessName: client.businessName,
    });
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/auth/consume", async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body ?? {});
    const { consumeMagicToken } = await import("../services/quotes/magicAuth.js");
    const result = await consumeMagicToken(token);
    if (!result) throw new ApiError(401, "invalid_token", "Link expired or invalid — request a new one");
    await ensurePriceBook(result.clientId);
    res.json({
      sessionToken: result.sessionToken,
      clientId: result.clientId,
      caps: { claude: claudeConfigured(), whisper: openaiConfigured() },
    });
  } catch (err) {
    next(err);
  }
});

tradieRouter.get("/me", requireClient, async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    await ensurePriceBook(client.id, client.tradeTitle);
    const twilio = client.twilioNumber || "";
    const digits = twilio.replace(/\D/g, "");
    res.json({
      id: client.id,
      businessName: client.businessName,
      tradeTitle: client.tradeTitle,
      town: client.town,
      addressLine1: client.addressLine1,
      addressLine2: client.addressLine2,
      postcode: client.postcode,
      vatNumber: client.vatNumber,
      routeKey: client.routeKey,
      status: client.status,
      trialEndsAt: client.trialEndsAt,
      accountActive: accountActive(client.status, client.trialEndsAt, client.stripeCustomerId),
      billingRequired: client.status === "TRIAL" && !client.stripeCustomerId,
      trialDays: env.TRIAL_DAYS,
      trialPricePence: env.SAAS_TRIAL_PRICE_PENCE,
      planPricePence: env.SAAS_PLAN_PRICE_PENCE,
      destPhone: client.destPhone,
      twilioNumber: client.twilioNumber,
      greetingAudioUrl: client.greetingAudioUrl,
      missedCallMode: client.missedCallMode,
      inboundEmail: client.inboundEmailLocal
        ? `${client.inboundEmailLocal}@${env.INBOUND_EMAIL_DOMAIN}`
        : null,
      bankName: client.bankName,
      bankSortCode: client.bankSortCode,
      bankAccountName: client.bankAccountName,
      bankAccountNumber: client.bankAccountNumber,
      googleReviewUrl: client.googleReviewUrl,
      defaultDepositPercent: client.defaultDepositPercent,
      stripeConnectOnboarded: client.stripeConnectOnboarded,
      stripeConnectAccountId: client.stripeConnectAccountId
        ? `${client.stripeConnectAccountId.slice(0, 8)}…`
        : null,
      divertCodes: twilio
        ? {
            noAnswer: `**61*${digits}#`,
            busy: `**67*${digits}#`,
            unreachable: `**62*${digits}#`,
          }
        : null,
      caps: { claude: claudeConfigured(), whisper: openaiConfigured() },
    });
  } catch (err) {
    next(err);
  }
});

tradieRouter.patch("/me", requireClient, async (req, res, next) => {
  try {
    const body = z
      .object({
        businessName: z.string().min(2).max(120).optional(),
        tradeTitle: z.string().max(80).nullable().optional(),
        town: z.string().max(80).nullable().optional(),
        addressLine1: z.string().max(160).nullable().optional(),
        addressLine2: z.string().max(160).nullable().optional(),
        postcode: z.string().max(12).nullable().optional(),
        vatNumber: z.string().max(30).nullable().optional(),
        destChannel: z.enum(["SMS", "WHATSAPP", "BOTH"]).optional(),
        bankName: z.string().max(80).nullable().optional(),
        bankSortCode: z.string().max(20).nullable().optional(),
        bankAccountName: z.string().max(120).nullable().optional(),
        bankAccountNumber: z.string().max(20).nullable().optional(),
        destPhone: z.string().min(10).max(30).optional(),
        twilioNumber: z.string().max(30).nullable().optional(),
        missedCallMode: z.enum(["SMS_QUALIFY", "VOICEMAIL"]).optional(),
        googleReviewUrl: z.string().url().max(500).nullable().optional().or(z.literal("")),
        defaultDepositPercent: z.number().int().min(0).max(100).optional(),
      })
      .parse(req.body ?? {});

    const nextDestPhone =
      body.destPhone !== undefined ? toE164UK(body.destPhone) : undefined;

    const nextTwilio =
      body.twilioNumber !== undefined
        ? body.twilioNumber
          ? toE164UK(body.twilioNumber)
          : null
        : undefined;

    let nextPostcode: string | null | undefined = undefined;
    if (body.postcode !== undefined) {
      nextPostcode = body.postcode
        ? extractPostcode(body.postcode) ?? normalizePostcode(body.postcode) ?? body.postcode.trim().toUpperCase()
        : null;
    }

    const client = await prisma.client.update({
      where: { id: clientId(req) },
      data: {
        ...(body.businessName !== undefined ? { businessName: body.businessName } : {}),
        ...(body.tradeTitle !== undefined ? { tradeTitle: body.tradeTitle } : {}),
        ...(body.town !== undefined ? { town: body.town } : {}),
        ...(body.addressLine1 !== undefined ? { addressLine1: body.addressLine1 } : {}),
        ...(body.addressLine2 !== undefined ? { addressLine2: body.addressLine2 } : {}),
        ...(nextPostcode !== undefined ? { postcode: nextPostcode } : {}),
        ...(body.vatNumber !== undefined ? { vatNumber: body.vatNumber } : {}),
        ...(body.destChannel !== undefined ? { destChannel: body.destChannel } : {}),
        ...(body.bankName !== undefined ? { bankName: body.bankName } : {}),
        ...(body.bankSortCode !== undefined ? { bankSortCode: body.bankSortCode } : {}),
        ...(body.bankAccountName !== undefined ? { bankAccountName: body.bankAccountName } : {}),
        ...(body.bankAccountNumber !== undefined ? { bankAccountNumber: body.bankAccountNumber } : {}),
        ...(nextDestPhone !== undefined ? { destPhone: nextDestPhone } : {}),
        ...(nextTwilio !== undefined ? { twilioNumber: nextTwilio } : {}),
        ...(body.missedCallMode !== undefined ? { missedCallMode: body.missedCallMode } : {}),
        ...(body.googleReviewUrl !== undefined
          ? { googleReviewUrl: body.googleReviewUrl || null }
          : {}),
        ...(body.defaultDepositPercent !== undefined
          ? { defaultDepositPercent: body.defaultDepositPercent }
          : {}),
      },
    });

    let twilioHooks: { voiceUrl: string; smsUrl: string; alreadyOk: boolean } | null = null;
    let twilioHooksError: string | null = null;
    if (nextTwilio && twilioConfigured()) {
      try {
        twilioHooks = await configureNumberWebhooks(nextTwilio);
      } catch (e) {
        twilioHooksError = e instanceof Error ? e.message : "Could not configure Twilio webhooks";
      }
    }

    res.json({
      ok: true,
      id: client.id,
      missedCallMode: client.missedCallMode,
      twilioHooks,
      twilioHooksError,
    });
  } catch (err) {
    next(err);
  }
});

/** Status of Voice/SMS webhooks on this client's Twilio number. */
tradieRouter.get("/me/twilio", requireClient, async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    if (!client.twilioNumber) {
      return res.json({ configured: false, reason: "No Twilio number saved on this account" });
    }
    if (!twilioConfigured()) {
      return res.json({ configured: false, reason: "Twilio credentials missing on server" });
    }
    const status = await getNumberWebhookStatus(client.twilioNumber);
    res.json({
      configured: status.found && status.voiceOk && status.smsOk,
      ...status,
    });
  } catch (err) {
    next(err);
  }
});

/** Point the client's Twilio number Voice + SMS webhooks at Railway. Fixes the “set up voice” message. */
tradieRouter.post("/me/twilio/configure", requireClient, async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    if (!client.twilioNumber) throw new ApiError(400, "missing", "Save a Twilio number first");
    if (!twilioConfigured()) throw new ApiError(503, "twilio", "Twilio credentials missing on server");

    const result = await configureNumberWebhooks(client.twilioNumber);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

const GREETING_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
]);
const MAX_GREETING_BYTES = 2 * 1024 * 1024; // ~30s WAV / short mp3

/** Upload a custom missed-call greeting (wav/mp3). Used instead of TTS when set. */
tradieRouter.post("/me/greeting", requireClient, async (req, res, next) => {
  try {
    const body = z
      .object({
        contentType: z.string().min(3).max(80),
        dataBase64: z.string().min(20),
      })
      .parse(req.body ?? {});

    const contentType = body.contentType.split(";")[0]!.trim().toLowerCase();
    if (!GREETING_TYPES.has(contentType) && !contentType.endsWith("wav") && !contentType.endsWith("mpeg")) {
      throw new ApiError(400, "bad_type", "Upload a WAV or MP3 greeting (Twilio cannot play WebM)");
    }

    const raw = body.dataBase64.includes(",") ? body.dataBase64.split(",")[1]! : body.dataBase64;
    const buf = Buffer.from(raw, "base64");
    if (!buf.length) throw new ApiError(400, "empty", "Empty audio");
    if (buf.length > MAX_GREETING_BYTES) {
      throw new ApiError(400, "too_large", "Greeting too large — keep it under ~20 seconds");
    }

    const mime =
      contentType === "audio/mp3"
        ? "audio/mpeg"
        : contentType.startsWith("audio/")
          ? contentType
          : "audio/wav";
    // Also write to disk for local/dev convenience; production playback uses DB bytes.
    await storeAudio(mime, buf).catch(() => null);

    const token = randomBytes(16).toString("hex");
    const playUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/public/greeting/${token}`;

    const updated = await prisma.client.update({
      where: { id: clientId(req) },
      data: {
        greetingAudioData: buf,
        greetingAudioMime: mime,
        greetingPlayToken: token,
        greetingAudioUrl: playUrl,
      },
      select: { id: true, greetingAudioUrl: true },
    });

    res.json({ ok: true, greetingAudioUrl: updated.greetingAudioUrl });
  } catch (err) {
    next(err);
  }
});

tradieRouter.delete("/me/greeting", requireClient, async (req, res, next) => {
  try {
    await prisma.client.update({
      where: { id: clientId(req) },
      data: {
        greetingAudioUrl: null,
        greetingPlayToken: null,
        greetingAudioData: null,
        greetingAudioMime: null,
      },
    });
    res.json({ ok: true, greetingAudioUrl: null });
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/billing/checkout", requireClient, async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const includeStarter = !client.stripeCustomerId;
    const result = await createCheckoutSession({
      clientId: client.id,
      includeStarter,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/billing/portal", requireClient, async (req, res, next) => {
  try {
    const { createBillingPortalSession } = await import("../services/billing/stripe.js");
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client?.stripeCustomerId) {
      throw new ApiError(400, "no_customer", "No billing customer yet — complete checkout first");
    }
    const result = await createBillingPortalSession({ customerId: client.stripeCustomerId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---- Jobs (enquiries) ----
tradieRouter.get("/jobs", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const enquiries = await prisma.enquiry.findMany({
      where: { clientId: cid },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        quotes: {
          where: { status: { not: "DELETED" } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, totalPence: true },
        },
      },
    });
    res.json(
      enquiries.map((e) => ({
        id: e.id,
        name: e.name,
        phone: e.phone,
        message: e.message,
        postcode: e.postcode,
        distanceMiles: e.distanceMiles,
        photoUrls: e.photoUrls,
        status: e.status,
        createdAt: e.createdAt,
        latestQuote: e.quotes[0] || null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

tradieRouter.get("/jobs/:enquiryId", requireClient, async (req, res, next) => {
  try {
    const enquiry = await prisma.enquiry.findFirst({
      where: { id: req.params.enquiryId, clientId: clientId(req) },
      include: {
        quotes: {
          where: { status: { not: "DELETED" } },
          orderBy: { createdAt: "desc" },
          include: { lines: quoteLineInclude },
        },
      },
    });
    if (!enquiry) throw new ApiError(404, "not_found", "Job not found");
    res.json(enquiry);
  } catch (err) {
    next(err);
  }
});

// ---- Voice / notes → draft ----
tradieRouter.post("/jobs/:enquiryId/notes", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const body = z.object({ transcript: z.string().min(3).max(8000) }).parse(req.body ?? {});
    const enquiry = await prisma.enquiry.findFirst({
      where: { id: req.params.enquiryId, clientId: clientId(req) },
    });
    if (!enquiry) throw new ApiError(404, "not_found", "Job not found");
    await ensurePriceBook(clientId(req));

    const voice = await prisma.voiceNote.create({
      data: {
        clientId: clientId(req),
        enquiryId: enquiry.id,
        transcript: body.transcript,
        status: "READY",
      },
    });
    const quote = await buildDraftQuoteFromTranscript({
      clientId: clientId(req),
      enquiryId: enquiry.id,
      voiceNoteId: voice.id,
      transcript: body.transcript,
    });
    res.status(201).json(quote);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/jobs/:enquiryId/voice", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const body = z
      .object({
        contentType: z.string().min(3).max(40),
        dataBase64: z.string().min(10),
        durationSec: z.number().optional(),
      })
      .parse(req.body ?? {});
    const enquiry = await prisma.enquiry.findFirst({
      where: { id: req.params.enquiryId, clientId: clientId(req) },
    });
    if (!enquiry) throw new ApiError(404, "not_found", "Job not found");

    const b64 = body.dataBase64.includes(",") ? body.dataBase64.slice(body.dataBase64.indexOf(",") + 1) : body.dataBase64;
    const buf = Buffer.from(b64, "base64");
    const stored = await storeAudio(body.contentType, buf);

    const voice = await prisma.voiceNote.create({
      data: {
        clientId: clientId(req),
        enquiryId: enquiry.id,
        audioUrl: stored.url,
        status: "TRANSCRIBING",
        durationSec: body.durationSec ?? null,
      },
    });

    try {
      const filename = path.basename(stored.path || "job.webm");
      const fileBuf = stored.path ? await fs.readFile(stored.path) : buf;
      const transcript = await transcribeWithWhisper(fileBuf, filename, body.contentType);
      await ensurePriceBook(clientId(req));
      const quote = await buildDraftQuoteFromTranscript({
        clientId: clientId(req),
        enquiryId: enquiry.id,
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

// ---- Price book ----
tradieRouter.get("/price-book", requireClient, async (req, res, next) => {
  try {
    res.json(await listPriceBook(clientId(req)));
  } catch (err) {
    next(err);
  }
});

tradieRouter.put("/price-book", requireClient, async (req, res, next) => {
  try {
    const body = z.object({ items: z.array(priceBookItemSchema) }).parse(req.body ?? {});
    res.json(await savePriceBookItems(clientId(req), body.items));
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/price-book/import", requireClient, async (req, res, next) => {
  try {
    const body = z.object({ rows: z.array(importRowSchema).max(500) }).parse(req.body ?? {});
    res.json(await upsertPriceBookRows(clientId(req), body.rows));
  } catch (err) {
    next(err);
  }
});

tradieRouter.delete("/price-book/:id", requireClient, async (req, res, next) => {
  try {
    const row = await deactivatePriceBookItem(clientId(req), req.params.id);
    if (!row) throw new ApiError(404, "not_found", "Price book item not found");
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ---- Quotes ----
tradieRouter.get("/quotes/:id", requireClient, async (req, res, next) => {
  try {
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      include: { lines: quoteLineInclude, enquiry: true },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");
    res.json(quote);
  } catch (err) {
    next(err);
  }
});

tradieRouter.put("/quotes/:id/lines", requireClient, async (req, res, next) => {
  try {
    const body = z
      .object({
        vatInclusive: z.boolean().optional(),
        customerNote: z.string().max(2000).nullable().optional(),
        lines: z.array(
          z.object({
            label: z.string().min(1),
            qty: z.number().positive(),
            unit: z.enum(["EACH", "HOUR", "DAY", "JOB", "METRE"]),
            unitPricePence: z.number().int().min(0),
            vatRate: z.number().min(0).max(100).default(20),
            source: z.string().optional(),
          })
        ),
      })
      .parse(req.body ?? {});

    const existing = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
    });
    if (!existing) throw new ApiError(404, "not_found", "Quote not found");
    if (existing.status !== "DRAFT") throw new ApiError(400, "not_draft", "Only draft quotes can be edited");

    await prisma.quoteLine.deleteMany({ where: { quoteId: existing.id } });
    await prisma.quoteLine.createMany({
      data: body.lines.map((l, i) => ({
        quoteId: existing.id,
        sort: i,
        label: l.label,
        qty: l.qty,
        unit: l.unit,
        unitPricePence: l.unitPricePence,
        vatRate: l.vatRate,
        source: l.source || "MANUAL",
      })),
    });
    if (body.vatInclusive !== undefined || body.customerNote !== undefined) {
      await prisma.quote.update({
        where: { id: existing.id },
        data: {
          vatInclusive: body.vatInclusive ?? existing.vatInclusive,
          customerNote: body.customerNote === undefined ? existing.customerNote : body.customerNote,
        },
      });
    }
    const updated = await recomputeQuoteTotals(existing.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/quotes/:id/approve", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const body = z
      .object({ depositPercent: z.number().int().min(0).max(100).optional() })
      .parse(req.body ?? {});
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      include: { lines: true, enquiry: true, client: true },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");
    if (quote.status !== "DRAFT") throw new ApiError(400, "not_draft", "Quote already sent");
    if (!quote.lines.length) throw new ApiError(400, "empty", "Add at least one line");
    if (quote.lines.some((l) => l.unitPricePence <= 0)) {
      throw new ApiError(400, "unpriced", "Set a price on every line before sending");
    }
    if (!quote.enquiry?.phone) throw new ApiError(400, "no_customer", "No customer phone on this job");

    const depositPercent =
      body.depositPercent !== undefined ? body.depositPercent : quote.client.defaultDepositPercent || 0;
    const depositPence = depositPercent > 0 ? Math.round((quote.totalPence * depositPercent) / 100) : 0;

    // Best-effort PDF
    let pdfUrl = quote.pdfUrl;
    try {
      const { renderMoneyPdf } = await import("../services/docs/pdf.js");
      const logo = await prisma.clientAsset.findFirst({
        where: { clientId: quote.clientId, kind: "LOGO" },
        orderBy: { createdAt: "desc" },
      });
      const pdf = await renderMoneyPdf({
        kind: "quote",
        businessName: quote.client.businessName,
        vatNumber: quote.client.vatNumber,
        customerName: quote.enquiry.name,
        lines: quote.lines.map((l) => ({
          label: l.label,
          qty: l.qty,
          unitPricePence: l.unitPricePence,
        })),
        subtotalPence: quote.subtotalPence,
        vatPence: quote.vatPence,
        totalPence: quote.totalPence,
        note: quote.customerNote,
        logoUrl: logo?.url,
      });
      pdfUrl = pdf.url;
    } catch (e) {
      console.warn("[quote] pdf failed", e instanceof Error ? e.message : e);
    }

    const publicUrl = `${appPublicUrl()}/q/${quote.publicToken}`;
    const depositNote =
      depositPence > 0 ? ` Deposit ${formatGbp(depositPence)} (${depositPercent}%) due on accept.` : "";
    const smsBody = `Hi ${quote.enquiry.name}, your quote from ${quote.client.businessName} is ready: ${formatGbp(quote.totalPence)}.${depositNote} View & accept: ${publicUrl}`;
    const results = await sendMessage({ to: quote.enquiry.phone, channel: "SMS", body: smsBody });
    await logMessage({
      clientId: quote.clientId,
      enquiryId: quote.enquiryId,
      direction: "OUTBOUND",
      toAddr: quote.enquiry.phone,
      body: smsBody,
      twilioSid: results[0]?.id,
    });

    const sentAt = new Date();
    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: "SENT",
        sentAt,
        depositPercent,
        depositPence,
        ...(pdfUrl ? { pdfUrl } : {}),
      },
      include: { lines: quoteLineInclude },
    });
    await scheduleQuoteFollowUps(quote.id, sentAt);
    res.json({ ...updated, publicUrl });
  } catch (err) {
    next(err);
  }
});

tradieRouter.delete("/quotes/:id", requireClient, async (req, res, next) => {
  try {
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");
    if (quote.status !== "DRAFT") throw new ApiError(400, "not_draft", "Only drafts can be deleted");
    await prisma.quote.update({ where: { id: quote.id }, data: { status: "DELETED" } });
    await cancelQuoteFollowUps(quote.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---- Quotes list ----
tradieRouter.get("/quotes", requireClient, async (req, res, next) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { clientId: clientId(req), status: { not: "DELETED" } },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        enquiry: { select: { id: true, name: true, phone: true, postcode: true } },
        lines: { select: { id: true }, take: 1 },
      },
    });
    res.json(
      quotes.map((q) => ({
        id: q.id,
        status: q.status,
        totalPence: q.totalPence,
        sentAt: q.sentAt,
        decidedAt: q.decidedAt,
        createdAt: q.createdAt,
        enquiry: q.enquiry,
        publicUrl: `${appPublicUrl()}/q/${q.publicToken}`,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ---- Invoices ----
tradieRouter.get("/invoices", requireClient, async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { clientId: clientId(req), status: { not: "VOID" } },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { lines: { orderBy: { sort: "asc" } } },
    });
    res.json(
      invoices.map((inv) => ({
        ...inv,
        publicUrl: `${appPublicUrl()}/i/${inv.publicToken}`,
      }))
    );
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/invoices/from-quote/:quoteId", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const invoice = await createInvoiceFromQuote(clientId(req), req.params.quoteId);
    res.json({ ...invoice, publicUrl: `${appPublicUrl()}/i/${invoice.publicToken}` });
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/invoices/:id/send", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const result = await sendInvoice(clientId(req), req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/invoices/:id/mark-paid", requireClient, async (req, res, next) => {
  try {
    const invoice = await markInvoicePaid(clientId(req), req.params.id);
    res.json(invoice);
  } catch (err) {
    next(err);
  }
});

// ---- Messages (conversation on a job) ----
tradieRouter.get("/jobs/:enquiryId/messages", requireClient, async (req, res, next) => {
  try {
    const enquiry = await prisma.enquiry.findFirst({
      where: { id: req.params.enquiryId, clientId: clientId(req) },
    });
    if (!enquiry) throw new ApiError(404, "not_found", "Job not found");
    const messages = await prisma.message.findMany({
      where: { enquiryId: enquiry.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// ---- Customers (distinct contacts from enquiries) ----
tradieRouter.get("/customers", requireClient, async (req, res, next) => {
  try {
    const enquiries = await prisma.enquiry.findMany({
      where: { clientId: clientId(req) },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        quotes: {
          where: { status: { not: "DELETED" } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, totalPence: true },
        },
      },
    });

    const byPhone = new Map<
      string,
      {
        phone: string;
        name: string;
        jobCount: number;
        lastJobAt: Date;
        lastEnquiryId: string;
        latestQuote: { id: string; status: string; totalPence: number } | null;
      }
    >();

    for (const e of enquiries) {
      const key = e.phone.replace(/\D/g, "").slice(-10) || e.phone;
      const existing = byPhone.get(key);
      if (!existing) {
        byPhone.set(key, {
          phone: e.phone,
          name: e.name,
          jobCount: 1,
          lastJobAt: e.createdAt,
          lastEnquiryId: e.id,
          latestQuote: e.quotes[0] || null,
        });
      } else {
        existing.jobCount += 1;
      }
    }

    res.json(Array.from(byPhone.values()).sort((a, b) => b.lastJobAt.getTime() - a.lastJobAt.getTime()));
  } catch (err) {
    next(err);
  }
});

// ---- Two-way SMS composer ----
tradieRouter.post("/jobs/:enquiryId/messages", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const body = z.object({ text: z.string().min(1).max(1200) }).parse(req.body ?? {});
    const enquiry = await prisma.enquiry.findFirst({
      where: { id: req.params.enquiryId, clientId: clientId(req) },
      include: { client: true },
    });
    if (!enquiry) throw new ApiError(404, "not_found", "Job not found");
    const results = await sendMessage({ to: enquiry.phone, channel: "SMS", body: body.text });
    const logged = await logMessage({
      clientId: enquiry.clientId,
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

// ---- Stripe Connect (Pay Now) ----
tradieRouter.post("/connect/onboard", requireClient, async (req, res, next) => {
  try {
    const {
      ensureConnectAccount,
      createConnectOnboardingLink,
      getConnectAccountStatus,
      stripeConfigured,
    } = await import("../services/billing/connect.js");
    if (!stripeConfigured()) throw new ApiError(400, "stripe_off", "Stripe is not configured on the server");

    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");

    const { accountId } = await ensureConnectAccount({
      clientId: client.id,
      existingAccountId: client.stripeConnectAccountId,
    });
    if (!client.stripeConnectAccountId) {
      await prisma.client.update({
        where: { id: client.id },
        data: { stripeConnectAccountId: accountId },
      });
    }

    const status = await getConnectAccountStatus(accountId);
    if (status.chargesEnabled) {
      await prisma.client.update({
        where: { id: client.id },
        data: { stripeConnectOnboarded: true },
      });
      return res.json({ ok: true, onboarded: true, url: null });
    }

    const base = appPublicUrl();
    const link = await createConnectOnboardingLink({
      accountId,
      refreshUrl: `${base}/t/settings?connect=refresh`,
      returnUrl: `${base}/t/settings?connect=return`,
    });
    res.json({ ok: true, onboarded: false, url: link.url });
  } catch (err) {
    next(err);
  }
});

tradieRouter.get("/connect/status", requireClient, async (req, res, next) => {
  try {
    const { getConnectAccountStatus, stripeConfigured } = await import("../services/billing/connect.js");
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    if (!stripeConfigured() || !client.stripeConnectAccountId) {
      return res.json({ configured: stripeConfigured(), onboarded: false, chargesEnabled: false });
    }
    const status = await getConnectAccountStatus(client.stripeConnectAccountId);
    if (status.chargesEnabled && !client.stripeConnectOnboarded) {
      await prisma.client.update({
        where: { id: client.id },
        data: { stripeConnectOnboarded: true },
      });
    }
    res.json({
      configured: true,
      onboarded: status.chargesEnabled || client.stripeConnectOnboarded,
      chargesEnabled: status.chargesEnabled,
      detailsSubmitted: status.detailsSubmitted,
    });
  } catch (err) {
    next(err);
  }
});

// ---- Diary / appointments ----
tradieRouter.get("/appointments", requireClient, async (req, res, next) => {
  try {
    const { listAppointments } = await import("../services/diary/appointments.js");
    const from = req.query.from ? new Date(String(req.query.from)) : new Date();
    const to = req.query.to
      ? new Date(String(req.query.to))
      : new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    const rows = await listAppointments(clientId(req), from, to);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/appointments", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const { createAppointment } = await import("../services/diary/appointments.js");
    const body = z
      .object({
        enquiryId: z.string().nullable().optional(),
        title: z.string().min(1).max(160),
        notes: z.string().max(2000).nullable().optional(),
        startsAt: z.string(),
        endsAt: z.string(),
        address: z.string().max(240).nullable().optional(),
        customerName: z.string().max(120).nullable().optional(),
        customerPhone: z.string().max(40).nullable().optional(),
        allowClash: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    let customerName = body.customerName || null;
    let customerPhone = body.customerPhone || null;
    let address = body.address || null;
    if (body.enquiryId) {
      const enq = await prisma.enquiry.findFirst({
        where: { id: body.enquiryId, clientId: clientId(req) },
      });
      if (enq) {
        customerName = customerName || enq.name;
        customerPhone = customerPhone || enq.phone;
        address = address || enq.postcode || null;
      }
    }

    const result = await createAppointment({
      clientId: clientId(req),
      enquiryId: body.enquiryId,
      title: body.title,
      notes: body.notes,
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      address,
      customerName,
      customerPhone,
      allowClash: body.allowClash,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/appointments/:id/on-my-way", requireClient, async (req, res, next) => {
  try {
    const { sendOnMyWay } = await import("../services/diary/appointments.js");
    const result = await sendOnMyWay(clientId(req), req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

tradieRouter.patch("/appointments/:id", requireClient, async (req, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(["SCHEDULED", "CONFIRMED", "ON_THE_WAY", "DONE", "CANCELLED", "NO_SHOW"]).optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(req.body ?? {});
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
    });
    if (!existing) throw new ApiError(404, "not_found", "Appointment not found");
    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
    if (body.status === "CANCELLED") {
      await prisma.followUp.updateMany({
        where: { appointmentId: existing.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ---- Certificates ----
tradieRouter.get("/certificates", requireClient, async (req, res, next) => {
  try {
    const rows = await prisma.certificate.findMany({
      where: { clientId: clientId(req) },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/certificates", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const { createCertificate } = await import("../services/certs/certificates.js");
    const body = z
      .object({
        kind: z.enum(["GAS_SAFETY", "MINOR_WORKS", "EICR"]),
        enquiryId: z.string().nullable().optional(),
        siteAddress: z.string().max(240).nullable().optional(),
        customerName: z.string().max(120).nullable().optional(),
        customerPhone: z.string().max(40).nullable().optional(),
        formData: z.record(z.unknown()).optional(),
      })
      .parse(req.body ?? {});
    const row = await createCertificate({
      clientId: clientId(req),
      ...body,
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

tradieRouter.get("/certificates/:id", requireClient, async (req, res, next) => {
  try {
    const row = await prisma.certificate.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
    });
    if (!row) throw new ApiError(404, "not_found", "Certificate not found");
    res.json(row);
  } catch (err) {
    next(err);
  }
});

tradieRouter.patch("/certificates/:id", requireClient, async (req, res, next) => {
  try {
    const { updateCertificate } = await import("../services/certs/certificates.js");
    const body = z
      .object({
        siteAddress: z.string().max(240).nullable().optional(),
        customerName: z.string().max(120).nullable().optional(),
        customerPhone: z.string().max(40).nullable().optional(),
        customerEmail: z.string().max(160).nullable().optional(),
        formData: z.record(z.unknown()).optional(),
      })
      .parse(req.body ?? {});
    const row = await updateCertificate(clientId(req), req.params.id, body);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/certificates/:id/sign", requireClient, async (req, res, next) => {
  try {
    const { signCertificate } = await import("../services/certs/certificates.js");
    const body = z.object({ signatureDataUrl: z.string().min(20) }).parse(req.body ?? {});
    const row = await signCertificate(clientId(req), req.params.id, body.signatureDataUrl);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/certificates/:id/send", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const { sendCertificate } = await import("../services/certs/certificates.js");
    const row = await sendCertificate(clientId(req), req.params.id);
    res.json(row);
  } catch (err) {
    next(err);
  }
});
