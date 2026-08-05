import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import type { PriceUnit } from "@prisma/client";
import { ApiError } from "../middleware/error.js";
import { idempotent } from "../middleware/idempotency.js";
import { ensureQuoteTemplates } from "../services/quotes/templates.js";
import { sendEmail } from "../services/email/send.js";
import { sendMessage, toE164UK, twilioConfigured } from "../services/messaging/sender.js";
import { storeAudio, storeImage } from "../services/storage/store.js";
import { createMagicLogin, createClientSession, resolveSession, appPublicUrl } from "../services/quotes/magicAuth.js";
import {
  attachCostPrices,
  createPriceBookItem,
  deactivatePriceBookItem,
  ensurePriceBook,
  listPriceBook,
  quoteLineInclude,
  savePriceBookItems,
  upsertPriceBookRows,
} from "../services/quotes/priceBook.js";
import { buildDraftQuoteFromTranscript, recomputeQuoteTotals } from "../services/quotes/draft.js";
import { scheduleQuoteFollowUps, cancelQuoteFollowUps } from "../services/quotes/followups.js";
import { formatGbp, totalsFromLines } from "../services/quotes/money.js";
import { transcribeWithWhisper } from "../services/quotes/whisper.js";
import { claudeConfigured, openaiConfigured } from "../settings.js";
import { logMessage } from "../services/messaging/log.js";
import { createCheckoutSession } from "../services/billing/stripe.js";
import { createInvoiceFromQuote, sendInvoice, markInvoicePaid } from "../services/invoices/invoice.js";
import { env } from "../env.js";
import { configureNumberWebhooks, getNumberWebhookStatus } from "../services/twilio/numbers.js";
import { extractPostcode, normalizePostcode } from "../services/geo/postcode.js";
import { createDirectJob } from "../services/jobs/create.js";

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

export async function requireClient(req: Request, _res: Response, next: NextFunction) {
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
export async function requireActiveAccount(req: Request, _res: Response, next: NextFunction) {
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

export function clientId(req: Request): string {
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
      onboardingRequired:
        !client.onboardingCompletedAt && !!client.stripeCustomerId && client.status === "TRIAL",
      onboardingStep: client.onboardingStep,
      onboardingCompletedAt: client.onboardingCompletedAt,
      onboardingDivertConfirmedAt: client.onboardingDivertConfirmedAt,
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
      defaultTermsNote: client.defaultTermsNote,
      labourCostPerHourPence: client.labourCostPerHourPence,
      logoUrl: (
        await prisma.clientAsset.findFirst({
          where: { clientId: client.id, kind: "LOGO" },
          orderBy: { createdAt: "desc" },
          select: { url: true },
        })
      )?.url ?? null,
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
        defaultTermsNote: z.string().max(2000).nullable().optional(),
        // Null clears it back to "my own time", which is the honest default for
        // a sole trader and must stay reachable once it has been set.
        labourCostPerHourPence: z.number().int().min(0).max(100000).nullable().optional(),
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
        ...(body.labourCostPerHourPence !== undefined
          ? { labourCostPerHourPence: body.labourCostPerHourPence }
          : {}),
        ...(body.defaultTermsNote !== undefined
          ? { defaultTermsNote: body.defaultTermsNote?.trim() || null }
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
      throw new ApiError(
        400,
        "bad_type",
        "Upload a WAV or MP3 greeting (Twilio cannot play MP4/M4A — re-record or convert first)"
      );
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

/** Upload / replace business logo — used on public quotes, invoices and PDFs. */
tradieRouter.post("/me/logo", requireClient, async (req, res, next) => {
  try {
    const body = z
      .object({
        contentType: z.string().min(3).max(40),
        dataBase64: z.string().min(10),
        filename: z.string().max(120).optional(),
      })
      .parse(req.body ?? {});

    const b64 = body.dataBase64.includes(",")
      ? body.dataBase64.slice(body.dataBase64.indexOf(",") + 1)
      : body.dataBase64;
    const buf = Buffer.from(b64, "base64");
    const stored = await storeImage(body.contentType, buf);
    const cid = clientId(req);

    await prisma.clientAsset.updateMany({
      where: { clientId: cid, kind: "LOGO" },
      data: { kind: "SHOWCASE" },
    });

    const asset = await prisma.clientAsset.create({
      data: {
        clientId: cid,
        kind: "LOGO",
        url: stored.url,
        filename: body.filename || "logo",
        caption: "Business logo",
        sort: 0,
      },
    });

    res.json({ ok: true, logoUrl: asset.url });
  } catch (err) {
    next(err);
  }
});

tradieRouter.delete("/me/logo", requireClient, async (req, res, next) => {
  try {
    await prisma.clientAsset.updateMany({
      where: { clientId: clientId(req), kind: "LOGO" },
      data: { kind: "SHOWCASE" },
    });
    res.json({ ok: true, logoUrl: null });
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

// ---- Onboarding wizard ----
tradieRouter.get("/onboarding", requireClient, async (req, res, next) => {
  try {
    const {
      buildOnboardingView,
      provisionNumberForClient,
    } = await import("../services/onboarding/onboarding.js");
    let client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");

    // Lazy provision if paid but no number yet
    if (client.stripeCustomerId && !client.twilioNumber && !client.onboardingCompletedAt) {
      await provisionNumberForClient(client.id);
      client = await prisma.client.findUnique({ where: { id: client.id } });
      if (!client) throw new ApiError(404, "not_found", "Client not found");
    }

    const since =
      client.onboardingDivertConfirmedAt ||
      new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentMissed = await prisma.missedCall.count({
      where: { clientId: client.id, createdAt: { gte: since } },
    });

    // Persist detection so polling / later steps stay green
    if (recentMissed > 0 && !client.onboardingTestCallAt && client.onboardingStep >= 2) {
      client = await prisma.client.update({
        where: { id: client.id },
        data: {
          onboardingTestCallAt: new Date(),
          onboardingStep: Math.max(client.onboardingStep, 3),
        },
      });
    }

    const view = buildOnboardingView(client);
    const {
      previewRatesForTrade,
      resolveTradePreset,
      tradeTitleForPreset,
      TRADE_PRESETS,
    } = await import("../services/quotes/priceBook.js");
    const priceBookCount = await prisma.priceBookItem.count({
      where: { clientId: client.id, active: true },
    });
    const existingRates =
      priceBookCount > 0
        ? await prisma.priceBookItem.findMany({
            where: { clientId: client.id, active: true },
            orderBy: [{ isCallout: "desc" }, { label: "asc" }],
            take: 8,
            select: {
              sku: true,
              label: true,
              unit: true,
              unitPricePence: true,
              isCallout: true,
            },
          })
        : [];
    const tradePreset = resolveTradePreset(client.tradeTitle);
    const ratePreview =
      existingRates.length > 0
        ? existingRates
        : previewRatesForTrade(tradeTitleForPreset(tradePreset));

    res.json({
      ...view,
      testCallDetected: recentMissed > 0 || !!client.onboardingTestCallAt,
      recentMissedCalls: recentMissed,
      priceBookCount,
      hasRates: priceBookCount > 0,
      tradePreset,
      tradePresets: TRADE_PRESETS.map((p) => ({ id: p.id, label: p.label })),
      ratePreview,
      hasBankDetails: !!(
        client.bankSortCode &&
        client.bankAccountName &&
        client.bankAccountNumber
      ),
      defaultDepositPercent: client.defaultDepositPercent,
      defaultTermsNote: client.defaultTermsNote,
      labourCostPerHourPence: client.labourCostPerHourPence,
    });
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/onboarding/provision-number", requireClient, async (req, res, next) => {
  try {
    const { provisionNumberForClient, buildOnboardingView } = await import(
      "../services/onboarding/onboarding.js"
    );
    const result = await provisionNumberForClient(clientId(req));
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    if (result.error && !result.phoneNumber) {
      throw new ApiError(502, "provision_failed", result.error);
    }
    res.json({ ...result, onboarding: buildOnboardingView(client) });
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/onboarding/step", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView, ONBOARDING_LAST_STEP } = await import(
      "../services/onboarding/onboarding.js"
    );
    const body = z
      .object({
        step: z.number().int().min(0).max(ONBOARDING_LAST_STEP).optional(),
        advance: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");

    let nextStep = client.onboardingStep;
    if (typeof body.step === "number") nextStep = body.step;
    else if (body.advance) nextStep = Math.min(ONBOARDING_LAST_STEP, client.onboardingStep + 1);

    const updated = await prisma.client.update({
      where: { id: client.id },
      data: { onboardingStep: nextStep },
    });
    res.json(buildOnboardingView(updated));
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/onboarding/confirm-divert", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView } = await import("../services/onboarding/onboarding.js");
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const updated = await prisma.client.update({
      where: { id: client.id },
      data: {
        onboardingDivertConfirmedAt: new Date(),
        onboardingStep: Math.max(3, client.onboardingStep),
      },
    });
    res.json(buildOnboardingView(updated));
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/onboarding/confirm-test", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView } = await import("../services/onboarding/onboarding.js");
    const updated = await prisma.client.update({
      where: { id: clientId(req) },
      data: {
        onboardingTestCallAt: new Date(),
        onboardingStep: 4,
      },
    });
    res.json(buildOnboardingView(updated));
  } catch (err) {
    next(err);
  }
});

tradieRouter.patch("/onboarding/alerts", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView } = await import("../services/onboarding/onboarding.js");
    const body = z.object({ destPhone: z.string().min(8).max(30) }).parse(req.body ?? {});
    const phone = toE164UK(body.destPhone);
    if (!phone.startsWith("+") || phone.replace(/\D/g, "").length < 10) {
      throw new ApiError(400, "bad_phone", "Enter a valid UK mobile (07… or +44…)");
    }
    const updated = await prisma.client.update({
      where: { id: clientId(req) },
      data: {
        destPhone: phone,
        onboardingStep: 5,
      },
    });
    res.json(buildOnboardingView(updated));
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/onboarding/test-alert", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView } = await import("../services/onboarding/onboarding.js");
    const body = z.object({ destPhone: z.string().min(8).max(30).optional() }).parse(req.body ?? {});
    const client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");

    const phone = toE164UK(body.destPhone?.trim() || client.destPhone);
    if (!phone.startsWith("+") || phone.replace(/\D/g, "").length < 10) {
      throw new ApiError(400, "bad_phone", "Enter a valid UK mobile (07… or +44…)");
    }

    // Persist if they edited the number before testing
    let updated = client;
    if (phone !== client.destPhone) {
      updated = await prisma.client.update({
        where: { id: client.id },
        data: { destPhone: phone },
      });
    }

    const text = `TradiesMate test alert for ${updated.businessName}: when a missed call becomes a job, you'll get a text like this on this number.`;
    const results = await sendMessage({
      to: phone,
      // Wizard test uses SMS so it works before WhatsApp is configured.
      channel: "SMS",
      body: text,
    });
    const ok = results.some((r) => r.ok);
    if (!ok) {
      const err = results.map((r) => r.error).filter(Boolean).join("; ") || "send_failed";
      throw new ApiError(502, "sms_failed", `Could not send test alert: ${err}`);
    }

    await logMessage({
      clientId: updated.id,
      direction: "OUTBOUND",
      channel: "SMS",
      toAddr: phone,
      body: text,
      status: "sent",
    });

    res.json({ ok: true, to: phone, onboarding: buildOnboardingView(updated) });
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/onboarding/seed-rates", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView } = await import("../services/onboarding/onboarding.js");
    const {
      ensurePriceBook,
      listPriceBook,
      tradeTitleForPreset,
      resolveTradePreset,
      previewRatesForTrade,
    } = await import("../services/quotes/priceBook.js");
    const body = z
      .object({
        tradePreset: z.enum(["plumber", "electrician", "heating"]).optional(),
        /** Wipe existing rates and load the chosen trade’s starters (onboarding “change trade”). */
        replace: z.boolean().optional(),
      })
      .parse(req.body ?? {});

    let client = await prisma.client.findUnique({ where: { id: clientId(req) } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");

    const preset = body.tradePreset ?? resolveTradePreset(client.tradeTitle);
    const tradeTitle = tradeTitleForPreset(preset);

    if (client.tradeTitle !== tradeTitle) {
      client = await prisma.client.update({
        where: { id: client.id },
        data: { tradeTitle },
      });
    }

    const before = await prisma.priceBookItem.count({ where: { clientId: client.id } });
    const replace = !!body.replace && before > 0;
    const seeded = await ensurePriceBook(client.id, tradeTitle, { replace });
    const items = await listPriceBook(client.id);
    const preview = items.slice(0, 8).map((i) => ({
      sku: i.sku,
      label: i.label,
      unit: i.unit,
      unitPricePence: i.unitPricePence,
      isCallout: i.isCallout,
    }));

    // Stay on step 5 so UI can show confirmation; continue advances to 6
    const updated = await prisma.client.update({
      where: { id: client.id },
      data: { onboardingStep: Math.max(client.onboardingStep, 5) },
    });

    res.json({
      seeded,
      alreadyHad: before > 0 && !replace,
      replaced: replace,
      count: items.length,
      items: preview.length ? preview : previewRatesForTrade(tradeTitle),
      onboarding: buildOnboardingView(updated),
    });
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/onboarding/confirm-rates", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView } = await import("../services/onboarding/onboarding.js");
    const updated = await prisma.client.update({
      where: { id: clientId(req) },
      data: { onboardingStep: 6 },
    });
    res.json(buildOnboardingView(updated));
  } catch (err) {
    next(err);
  }
});

tradieRouter.patch("/onboarding/bank", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView } = await import("../services/onboarding/onboarding.js");
    const { normalizeBankFields, hasBankDetails } = await import("../services/onboarding/bank.js");
    const body = z
      .object({
        bankName: z.string().max(80).optional(),
        bankSortCode: z.string().max(20).optional(),
        bankAccountName: z.string().max(80).optional(),
        bankAccountNumber: z.string().max(20).optional(),
      })
      .parse(req.body ?? {});
    const cid = clientId(req);
    const existing = await prisma.client.findUnique({
      where: { id: cid },
      select: { onboardingStep: true },
    });
    if (!existing) throw new ApiError(404, "not_found", "Client not found");

    const normalized = normalizeBankFields(body);
    const updated = await prisma.client.update({
      where: { id: cid },
      data: {
        bankName: normalized.bankName,
        bankSortCode: normalized.bankSortCode,
        bankAccountName: normalized.bankAccountName,
        bankAccountNumber: normalized.bankAccountNumber,
        onboardingStep: Math.max(existing.onboardingStep, 6),
      },
    });
    res.json({
      ...buildOnboardingView(updated),
      hasBankDetails: hasBankDetails(updated),
    });
  } catch (err) {
    next(err);
  }
});

tradieRouter.post("/onboarding/complete", requireClient, async (req, res, next) => {
  try {
    const { buildOnboardingView, ONBOARDING_LAST_STEP } = await import(
      "../services/onboarding/onboarding.js"
    );
    const updated = await prisma.client.update({
      where: { id: clientId(req) },
      data: {
        onboardingCompletedAt: new Date(),
        onboardingStep: ONBOARDING_LAST_STEP,
      },
    });
    res.json(buildOnboardingView(updated));
  } catch (err) {
    next(err);
  }
});

export function customerPhoneKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}



tradieRouter.get("/inbox", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const enquiries = await prisma.enquiry.findMany({
      where: { clientId: cid, pipeline: "INBOX" },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        missedCalls: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, conversation: true, status: true, createdAt: true },
        },
      },
    });
    const needsYou = enquiries.filter((e) => e.triage !== "SPAM").length;
    const caughtSpam = enquiries.filter((e) => e.triage === "SPAM").length;
    res.json({
      needsYouCount: needsYou,
      caughtSpamCount: caughtSpam,
      items: enquiries.map((e) => {
        const missed = e.missedCalls[0];
        const raw = Array.isArray(missed?.conversation) ? missed.conversation : [];
        // The whole exchange, not a précis of it. What the customer actually
        // typed — "it's coming through the ceiling", "I'm in all afternoon" —
        // is the bit worth reading before ringing back, and a summary is where
        // that detail goes to die.
        const conversation = (raw as { role?: string; text?: string; at?: string }[])
          .filter((t) => t?.text)
          .map((t) => ({
            role: t.role === "assistant" ? "assistant" : "user",
            text: String(t.text),
            at: typeof t.at === "string" ? t.at : null,
          }));
        const snippet = conversation
          .filter((t) => t.role === "user")
          .map((t) => t.text)
          .slice(-2)
          .join(" · ")
          .slice(0, 220);
        return {
          id: e.id,
          name: e.name,
          phone: e.phone,
          email: e.email,
          message: e.message,
          addressLine: e.addressLine,
          postcode: e.postcode,
          urgency: e.urgency,
          distanceMiles: e.distanceMiles,
          source: e.source,
          triage: e.triage,
          summary: e.summary || e.message,
          conversation,
          conversationSnippet: snippet || null,
          photoUrls: e.photoUrls,
          createdAt: e.createdAt,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /jobs — tradie-created job (walk-up / WhatsApp / returning customer) */














// ---- Voice / notes → draft ----




const priceBookItemSchema = z.object({
  id: z.string().optional(),
  sku: z.string().nullable().optional(),
  label: z.string().min(1),
  // Left optional on purpose — an app build that predates categories must not
  // blank them by omission. See savePriceBookItems.
  category: z.string().nullable().optional(),
  unit: z.enum(["EACH", "HOUR", "DAY", "JOB", "METRE"]),
  unitPricePence: z.number().int().min(0),
  // Optional with no default, like category: an app build that predates cost
  // prices must not blank a tradie's costs simply by not knowing about them.
  costPricePence: z.number().int().min(0).nullable().optional(),
  vatRate: z.number().min(0).max(100).default(20),
  isCallout: z.boolean().optional(),
  active: z.boolean().optional(),
});

const importRowSchema = z.object({
  sku: z.string().nullable().optional(),
  label: z.string().min(1),
  category: z.string().nullable().optional(),
  unit: z.string().optional(),
  unitPriceGbp: z.number().optional(),
  unitPricePence: z.number().int().min(0).optional(),
  costPriceGbp: z.number().optional(),
  costPricePence: z.number().int().min(0).optional(),
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

tradieRouter.put("/price-book", requireClient, idempotent(async (req, res, next) => {
  try {
    const body = z.object({ items: z.array(priceBookItemSchema) }).parse(req.body ?? {});
    res.json(await savePriceBookItems(clientId(req), body.items));
  } catch (err) {
    next(err);
  }
}));

/** Single-rate create from the "New rate item" flow — see createPriceBookItem. */
tradieRouter.post("/price-book/items", requireClient, idempotent(async (req, res, next) => {
  try {
    const body = priceBookItemSchema.parse(req.body ?? {});
    res.status(201).json(await createPriceBookItem(clientId(req), body));
  } catch (err) {
    next(err);
  }
}));

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
    res.json({ ...quote, publicUrl: `${appPublicUrl()}/q/${quote.publicToken}` });
  } catch (err) {
    next(err);
  }
});

tradieRouter.put("/quotes/:id/lines", requireClient, idempotent(async (req, res, next) => {
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

    const pricedLines = await attachCostPrices(clientId(req), body.lines);
    await prisma.quoteLine.deleteMany({ where: { quoteId: existing.id } });
    await prisma.quoteLine.createMany({
      data: pricedLines.map((l, i) => ({
        quoteId: existing.id,
        sort: i,
        label: l.label,
        qty: l.qty,
        unit: l.unit,
        unitPricePence: l.unitPricePence,
        costPricePence: l.costPricePence,
        vatRate: l.vatRate,
        priceBookItemId: l.priceBookItemId,
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
}));

tradieRouter.post("/quotes/:id/approve", requireClient, requireActiveAccount, async (req, res, next) => {
  try {
    const body = z
      .object({
        depositPercent: z.number().int().min(0).max(100).optional(),
        // Step 8 lets the tradie pick where it goes. SMS alone stays the default
        // so the existing job-page flow behaves exactly as before.
        channels: z.array(z.enum(["SMS", "WHATSAPP", "EMAIL"])).min(1).optional(),
        email: z.string().email().max(160).optional(),
        message: z.string().max(1000).optional(),
      })
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
    const custom = body.message?.trim();
    const smsBody = custom
      ? custom.includes(publicUrl)
        ? custom
        : `${custom} ${publicUrl}`
      : `Hi ${quote.enquiry.name}, your quote from ${quote.client.businessName} is ready: ${formatGbp(quote.totalPence)}.${depositNote} View & accept: ${publicUrl}`;

    const channels = body.channels ?? ["SMS"];
    const wantsText = channels.includes("SMS");
    const wantsWhatsApp = channels.includes("WHATSAPP");
    if (wantsText || wantsWhatsApp) {
      const channel = wantsText && wantsWhatsApp ? "BOTH" : wantsText ? "SMS" : "WHATSAPP";
      const results = await sendMessage({ to: quote.enquiry.phone, channel, body: smsBody });
      await logMessage({
        clientId: quote.clientId,
        enquiryId: quote.enquiryId,
        direction: "OUTBOUND",
        toAddr: quote.enquiry.phone,
        body: smsBody,
        twilioSid: results[0]?.id,
      });
    }

    const emailTo = body.email || quote.enquiry.email;
    if (channels.includes("EMAIL") && emailTo) {
      // Best-effort: a failed email must not leave the quote stuck as a draft when
      // the text already went out.
      try {
        await sendEmail({
          to: emailTo,
          subject: `Your quote from ${quote.client.businessName} — ${formatGbp(quote.totalPence)}`,
          text: `${smsBody}\n\n${quote.termsNote || ""}`.trim(),
        });
      } catch (e) {
        console.warn("[quote] email failed", e instanceof Error ? e.message : e);
      }
    }

    const sentAt = new Date();
    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: "SENT",
        sentAt,
        depositPercent,
        depositPence,
        // The countdown the customer sees starts when it's sent, not when drafted.
        validUntil: new Date(sentAt.getTime() + quote.validDays * 24 * 60 * 60 * 1000),
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

tradieRouter.delete("/quotes/:id", requireClient, idempotent(async (req, res, next) => {
  try {
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");
    if (quote.status === "DELETED") throw new ApiError(404, "not_found", "Quote not found");
    await prisma.quote.update({ where: { id: quote.id }, data: { status: "DELETED" } });
    await cancelQuoteFollowUps(quote.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));

tradieRouter.post("/quotes/:id/archive", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const quote = await prisma.quote.findFirst({
      where: {
        id: req.params.id,
        clientId: clientId(req),
        status: { notIn: ["DELETED", "ARCHIVED"] },
      },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");
    await cancelQuoteFollowUps(quote.id);
    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: { statusBeforeArchive: quote.status, status: "ARCHIVED" },
    });
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
}));

tradieRouter.post("/quotes/:id/unarchive", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req), status: "ARCHIVED" },
    });
    if (!quote) throw new ApiError(404, "not_found", "Archived quote not found");
    const restore =
      quote.statusBeforeArchive && quote.statusBeforeArchive !== "ARCHIVED" && quote.statusBeforeArchive !== "DELETED"
        ? quote.statusBeforeArchive
        : quote.sentAt
          ? "SENT"
          : "DRAFT";
    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: { status: restore, statusBeforeArchive: null },
    });
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
}));

tradieRouter.get("/archived", requireClient, async (req, res, next) => {
  try {
    const cid = clientId(req);
    const [jobs, quotes] = await Promise.all([
      prisma.job.findMany({
        where: { clientId: cid, archivedAt: { not: null } },
        orderBy: { archivedAt: "desc" },
        take: 80,
        include: {
          enquiry: { select: { name: true, phone: true, message: true, postcode: true, distanceMiles: true } },
          customer: { select: { name: true } },
          property: { select: { postcode: true } },
          quote: { select: { id: true, status: true, totalPence: true } },
        },
      }),
      prisma.quote.findMany({
        where: { clientId: cid, status: "ARCHIVED" },
        orderBy: { createdAt: "desc" },
        take: 80,
        include: {
          enquiry: { select: { id: true, name: true, phone: true, postcode: true } },
        },
      }),
    ]);
    res.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.enquiry?.name || j.customer?.name || "Customer",
        phone: j.enquiry?.phone || "",
        message: j.scope || j.enquiry?.message || null,
        postcode: j.enquiry?.postcode || j.property?.postcode || null,
        distanceMiles: j.enquiry?.distanceMiles ?? null,
        createdAt: j.createdAt,
        title: j.title,
        operational: j.operational,
        commercial: j.commercial,
        archivedAt: j.archivedAt,
        latestQuote: j.quote,
      })),
      quotes: quotes.map((q) => ({
        id: q.id,
        status: q.status,
        statusBeforeArchive: q.statusBeforeArchive,
        totalPence: q.totalPence,
        sentAt: q.sentAt,
        createdAt: q.createdAt,
        enquiry: q.enquiry,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---- Quotes list ----
// ---- Quote templates & standalone quote creation (wireframe steps 1-8) ----

/** "Q-1052" — short, human, and unique enough per client without a counter table. */
function newQuoteReference(): string {
  return `Q-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

/** Step 2 — browse templates, with the counts and categories the chips need. */
tradieRouter.get("/templates", requireClient, async (req, res, next) => {
  try {
    await ensureQuoteTemplates(clientId(req));
    const templates = await prisma.quoteTemplate.findMany({
      where: { clientId: clientId(req), active: true },
      orderBy: [{ lastUsedAt: "desc" }, { name: "asc" }],
      include: { items: { select: { id: true, isAddOn: true } } },
    });
    res.json(
      templates.map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        description: t.description,
        lastUsedAt: t.lastUsedAt,
        updatedAt: t.updatedAt,
        tags: t.tags,
        useForAiDrafting: t.useForAiDrafting,
        itemCount: t.items.filter((i) => !i.isAddOn).length,
        addOnCount: t.items.filter((i) => i.isAddOn).length,
      }))
    );
  } catch (err) {
    next(err);
  }
});

const templateItemSchema = z.object({
  label: z.string().min(1).max(300),
  qty: z.number().default(1),
  unit: z.string().default("JOB"),
  unitPricePence: z.number().int().default(0),
  vatRate: z.number().int().default(20),
  isAddOn: z.boolean().default(false),
  priceBookItemId: z.string().nullable().optional(),
});

/**
 * Create a template, optionally with an id the phone chose.
 *
 * Same reasoning as quotes: the price book is cached on the device, so a tradie
 * can build a template with no signal and the write queues. Accepting their id is
 * what lets the follow-up "add these items" and "save" writes find the same row.
 */
tradieRouter.post("/templates", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const body = z
      .object({
        id: z.string().min(8).max(64).optional(),
        name: z.string().min(1).max(160),
        category: z.string().max(60).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        tags: z.array(z.string().max(40)).max(8).default([]),
        defaultDurationMins: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
        useForAiDrafting: z.boolean().default(true),
        vatRate: z.number().int().min(0).max(100).default(20),
        depositPercent: z.number().int().min(0).max(100).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        items: z.array(templateItemSchema).default([]),
      })
      .parse(req.body ?? {});

    if (body.id) {
      const clash = await prisma.quoteTemplate.findUnique({
        where: { id: body.id },
        select: { clientId: true },
      });
      if (clash) {
        if (clash.clientId !== clientId(req)) throw new ApiError(409, "id_taken", "Template id already used");
        // Retry after a lost response — hand back what's there rather than duplicating.
        const existing = await prisma.quoteTemplate.findUnique({
          where: { id: body.id },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        });
        res.status(200).json(existing);
        return;
      }
    }

    const created = await prisma.quoteTemplate.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        clientId: clientId(req),
        name: body.name.trim(),
        category: body.category ?? null,
        description: body.description ?? null,
        tags: body.tags,
        defaultDurationMins: body.defaultDurationMins ?? null,
        useForAiDrafting: body.useForAiDrafting,
        vatRate: body.vatRate,
        depositPercent: body.depositPercent ?? null,
        notes: body.notes ?? null,
        items: {
          create: body.items.map((i, index) => ({
            label: i.label,
            qty: i.qty,
            unit: i.unit,
            unitPricePence: i.unitPricePence,
            vatRate: i.vatRate,
            isAddOn: i.isAddOn,
            sortOrder: index,
            priceBookItemId: i.priceBookItemId ?? null,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}));

/**
 * Update a template. When `items` is present it replaces the whole set.
 *
 * Wholesale replacement rather than per-item diffing because the edit screen is a
 * single "Save template" — the tradie reorders, retitles and deletes freely, and
 * trying to reconcile that into individual operations would be all risk and no gain.
 */
tradieRouter.patch("/templates/:id", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).max(160).optional(),
        category: z.string().max(60).nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        tags: z.array(z.string().max(40)).max(8).optional(),
        defaultDurationMins: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
        useForAiDrafting: z.boolean().optional(),
        vatRate: z.number().int().min(0).max(100).optional(),
        depositPercent: z.number().int().min(0).max(100).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        items: z.array(templateItemSchema).optional(),
      })
      .parse(req.body ?? {});

    const template = await prisma.quoteTemplate.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      select: { id: true },
    });
    if (!template) throw new ApiError(404, "not_found", "Template not found");

    const updated = await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.quoteTemplateItem.deleteMany({ where: { templateId: template.id } });
      }
      return tx.quoteTemplate.update({
        where: { id: template.id },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.tags !== undefined ? { tags: body.tags } : {}),
          ...(body.defaultDurationMins !== undefined
            ? { defaultDurationMins: body.defaultDurationMins }
            : {}),
          ...(body.useForAiDrafting !== undefined ? { useForAiDrafting: body.useForAiDrafting } : {}),
          ...(body.vatRate !== undefined ? { vatRate: body.vatRate } : {}),
          ...(body.depositPercent !== undefined ? { depositPercent: body.depositPercent } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.items
            ? {
                items: {
                  create: body.items.map((i, index) => ({
                    label: i.label,
                    qty: i.qty,
                    unit: i.unit,
                    unitPricePence: i.unitPricePence,
                    vatRate: i.vatRate,
                    isAddOn: i.isAddOn,
                    sortOrder: index,
                    priceBookItemId: i.priceBookItemId ?? null,
                  })),
                },
              }
            : {}),
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}));

/** Soft delete — quotes already built from it keep their lines regardless. */
tradieRouter.delete("/templates/:id", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const template = await prisma.quoteTemplate.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      select: { id: true },
    });
    if (!template) throw new ApiError(404, "not_found", "Template not found");
    await prisma.quoteTemplate.update({ where: { id: template.id }, data: { active: false } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}));

/** Duplicate — the fastest way to make a near-identical variant of a job. */
tradieRouter.post("/templates/:id/duplicate", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const body = z.object({ id: z.string().min(8).max(64).optional() }).parse(req.body ?? {});
    const source = await prisma.quoteTemplate.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!source) throw new ApiError(404, "not_found", "Template not found");

    if (body.id) {
      const clash = await prisma.quoteTemplate.findUnique({ where: { id: body.id }, select: { id: true } });
      if (clash) {
        const existing = await prisma.quoteTemplate.findUnique({
          where: { id: body.id },
          include: { items: { orderBy: { sortOrder: "asc" } } },
        });
        res.status(200).json(existing);
        return;
      }
    }

    const copy = await prisma.quoteTemplate.create({
      data: {
        ...(body.id ? { id: body.id } : {}),
        clientId: clientId(req),
        name: `${source.name} (copy)`,
        category: source.category,
        description: source.description,
        tags: source.tags,
        defaultDurationMins: source.defaultDurationMins,
        useForAiDrafting: source.useForAiDrafting,
        vatRate: source.vatRate,
        depositPercent: source.depositPercent,
        notes: source.notes,
        items: {
          create: source.items.map((i) => ({
            label: i.label,
            qty: i.qty,
            unit: i.unit,
            unitPricePence: i.unitPricePence,
            vatRate: i.vatRate,
            isAddOn: i.isAddOn,
            sortOrder: i.sortOrder,
            priceBookItemId: i.priceBookItemId,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    res.status(201).json(copy);
  } catch (err) {
    next(err);
  }
}));

/** Step 3 — what's included vs what's an optional extra. */
tradieRouter.get("/templates/:id", requireClient, async (req, res, next) => {
  try {
    const template = await prisma.quoteTemplate.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!template) throw new ApiError(404, "not_found", "Template not found");
    res.json({
      id: template.id,
      name: template.name,
      category: template.category,
      description: template.description,
      tags: template.tags,
      defaultDurationMins: template.defaultDurationMins,
      useForAiDrafting: template.useForAiDrafting,
      vatRate: template.vatRate,
      depositPercent: template.depositPercent,
      notes: template.notes,
      included: template.items.filter((i) => !i.isAddOn),
      addOns: template.items.filter((i) => i.isAddOn),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Create a draft with no customer yet.
 *
 * The customer is attached at preview (step 8) so capture is never blocked —
 * a tradie standing in someone's kitchen shouldn't have to do data entry before
 * they can start pricing. Quote.enquiryId already allowed null.
 */
async function createDraftQuote(
  client: string,
  lines: {
    label: string;
    qty: number;
    // Template items store the unit as free text; QuoteLine wants the enum.
    unit: string;
    unitPricePence: number;
    vatRate: number;
    priceBookItemId?: string | null;
  }[],
  id?: string
) {
  const asUnit = (u: string): PriceUnit =>
    (["EACH", "HOUR", "DAY", "JOB", "METRE"] as const).includes(u as PriceUnit) ? (u as PriceUnit) : "JOB";
  const lineRows = lines.map((l, i) => ({
    label: l.label,
    qty: l.qty,
    unit: asUnit(l.unit),
    unitPricePence: l.unitPricePence,
    vatRate: l.vatRate,
    priceBookItemId: l.priceBookItemId ?? null,
    source: "BOOK" as const,
    sort: i,
  }));
  // Totals on create — avoids a follow-up recompute + re-fetch round trip.
  const totals = totalsFromLines(lineRows, true);
  return prisma.quote.create({
    data: {
      // The phone picks the id when offline so it can navigate straight to the draft.
      ...(id ? { id } : {}),
      clientId: client,
      status: "DRAFT",
      reference: newQuoteReference(),
      publicToken: randomBytes(18).toString("base64url"),
      vatInclusive: true,
      ...totals,
      lines: { create: lineRows },
    },
    include: { lines: quoteLineInclude, enquiry: true },
  });
}

/** Step 3 → 6. Chosen add-ons come through as ids so pricing stays server-side. */


/** Step 1 "Blank" — start from nothing with a single empty line to type into. */


/** Step 4 — notes to draft, with no job attached yet. */


/** Step 5 — voice to draft, with no job attached yet. */


/**
 * Create a draft, optionally with an id the phone chose.
 *
 * A tradie with no signal still needs to open the quote they just started, so the
 * phone mints the id, navigates immediately, and this write is queued. Accepting
 * that id is what makes every later edit — lines, terms, customer — line up
 * against the same record when the queue drains.
 *
 * Lines arrive fully resolved rather than as a templateId so the flow behaves
 * identically offline, and so a tradie quotes the prices they actually saw on
 * screen rather than whatever the template says by the time it syncs.
 */
tradieRouter.post("/quotes", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const body = z
      .object({
        id: z.string().min(8).max(64).optional(),
        templateId: z.string().optional(),
        lines: z
          .array(
            z.object({
              label: z.string().max(300).default(""),
              qty: z.number().default(1),
              unit: z.string().default("JOB"),
              unitPricePence: z.number().int().default(0),
              vatRate: z.number().int().default(20),
            })
          )
          .default([]),
      })
      .parse(req.body ?? {});

    if (body.id) {
      const clash = await prisma.quote.findUnique({ where: { id: body.id }, select: { clientId: true } });
      if (clash) {
        // Already created — the phone retried after a lost response. Hand back the
        // existing draft rather than erroring, same principle as the idempotency keys.
        if (clash.clientId !== clientId(req)) throw new ApiError(409, "id_taken", "Quote id already used");
        const existing = await prisma.quote.findUnique({
          where: { id: body.id },
          include: { lines: quoteLineInclude, enquiry: true },
        });
        res.status(200).json(existing);
        return;
      }
    }

    const quote = await createDraftQuote(
      clientId(req),
      body.lines.map((l) => ({ ...l, priceBookItemId: null })),
      body.id
    );

    if (body.templateId) {
      await prisma.quoteTemplate
        .updateMany({
          where: { id: body.templateId, clientId: clientId(req) },
          data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
        })
        .catch(() => undefined);
    }

    res.status(201).json(quote);
  } catch (err) {
    next(err);
  }
}));

/** Step 4 — build priced lines into a draft the phone already created. */
tradieRouter.post("/quotes/:id/from-notes", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const body = z.object({ transcript: z.string().min(3).max(8000) }).parse(req.body ?? {});
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      select: { id: true },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");

    await ensurePriceBook(clientId(req));
    const voice = await prisma.voiceNote.create({
      data: { clientId: clientId(req), transcript: body.transcript, status: "READY" },
    });
    const built = await buildDraftQuoteFromTranscript({
      clientId: clientId(req),
      voiceNoteId: voice.id,
      transcript: body.transcript,
      intoQuoteId: quote.id,
    });
    res.status(201).json(built);
  } catch (err) {
    next(err);
  }
}));

/** Step 5 — same, from audio recorded on the phone. */
tradieRouter.post("/quotes/:id/from-voice", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const body = z
      .object({
        contentType: z.string().min(3).max(40),
        dataBase64: z.string().min(10),
        durationSec: z.number().optional(),
      })
      .parse(req.body ?? {});
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
      select: { id: true },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");

    const b64 = body.dataBase64.includes(",")
      ? body.dataBase64.slice(body.dataBase64.indexOf(",") + 1)
      : body.dataBase64;
    const buf = Buffer.from(b64, "base64");
    const stored = await storeAudio(body.contentType, buf);

    const voice = await prisma.voiceNote.create({
      data: {
        clientId: clientId(req),
        audioUrl: stored.url,
        status: "TRANSCRIBING",
        durationSec: body.durationSec ?? null,
      },
    });

    const filename = path.basename(stored.path || "quote.webm");
    const fileBuf = stored.path ? await fs.readFile(stored.path) : buf;
    const transcript = await transcribeWithWhisper(fileBuf, filename, body.contentType);
    await ensurePriceBook(clientId(req));
    const built = await buildDraftQuoteFromTranscript({
      clientId: clientId(req),
      voiceNoteId: voice.id,
      transcript,
      intoQuoteId: quote.id,
    });
    res.status(201).json({ quote: built, transcript });
  } catch (err) {
    next(err);
  }
}));

/** Step 7 — deposit, how long it stands, and what the tradie promised on timing. */
tradieRouter.patch("/quotes/:id/terms", requireClient, idempotent(async (req, res, next) => {
  try {
    const body = z
      .object({
        depositPercent: z.number().int().min(0).max(100).optional(),
        validDays: z.number().int().min(1).max(365).optional(),
        earliestStartAt: z.string().nullable().optional(),
        estimatedDuration: z.string().max(80).nullable().optional(),
        termsNote: z.string().max(2000).nullable().optional(),
      })
      .parse(req.body ?? {});

    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");

    const depositPercent = body.depositPercent ?? quote.depositPercent;
    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        depositPercent,
        // Kept in step so the preview and the customer's page agree without a recompute.
        depositPence: depositPercent > 0 ? Math.round((quote.totalPence * depositPercent) / 100) : 0,
        ...(body.validDays !== undefined ? { validDays: body.validDays } : {}),
        ...(body.earliestStartAt !== undefined
          ? { earliestStartAt: body.earliestStartAt ? new Date(body.earliestStartAt) : null }
          : {}),
        ...(body.estimatedDuration !== undefined ? { estimatedDuration: body.estimatedDuration } : {}),
        ...(body.termsNote !== undefined ? { termsNote: body.termsNote } : {}),
      },
      include: { lines: quoteLineInclude, enquiry: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}));

/**
 * Step 8 — attach the customer, right before sending.
 *
 * Reuses the existing job record when one matches the number, so a quote raised
 * on the doorstep lands against the same customer as their missed call rather
 * than creating a duplicate contact.
 */
tradieRouter.patch("/quotes/:id/customer", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
  try {
    const body = z
      .object({
        enquiryId: z.string().optional(),
        name: z.string().min(1).max(120).optional(),
        phone: z.string().min(5).max(32).optional(),
        email: z.string().email().max(160).nullable().optional(),
        postcode: z.string().max(16).nullable().optional(),
      })
      .parse(req.body ?? {});

    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, clientId: clientId(req) },
    });
    if (!quote) throw new ApiError(404, "not_found", "Quote not found");

    let enquiryId = body.enquiryId ?? null;
    if (!enquiryId) {
      if (!body.name || !body.phone) {
        throw new ApiError(400, "customer_required", "Pick a customer or enter a name and number");
      }
      const phone = toE164UK(body.phone) || body.phone.trim();
      const phoneKey = customerPhoneKey(phone);
      // Match 07… and +44… as the same customer — exact string match was creating
      // duplicate jobs whenever the picker and the stored enquiry disagreed on format.
      const variants = new Set<string>([phone, body.phone.trim()]);
      if (phone.startsWith("+44") && phone.length > 3) variants.add(`0${phone.slice(3)}`);
      if (phone.startsWith("0") && phone.length > 1) variants.add(`+44${phone.slice(1)}`);
      const existing =
        (await prisma.enquiry.findFirst({
          where: { clientId: clientId(req), phone: { in: [...variants] } },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })) ||
        (
          await prisma.enquiry.findMany({
            where: { clientId: clientId(req) },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: { id: true, phone: true },
          })
        ).find((e) => customerPhoneKey(e.phone) === phoneKey);
      if (existing) {
        enquiryId = existing.id;
      } else {
        const created = await prisma.enquiry.create({
          data: {
            clientId: clientId(req),
            name: body.name.trim(),
            phone,
            email: body.email ?? null,
            postcode: body.postcode ?? null,
            message: "Quote raised on site",
            source: "manual",
            pipeline: "JOB",
          },
        });
        // A quote raised on site for a new customer is work in the pipeline, and
        // used to appear in the Jobs list by virtue of pipeline=JOB. Now that the
        // list reads real Job rows, it needs one — without this the quote would
        // save and the job would silently never show up.
        await createDirectJob({
          clientId: clientId(req),
          id: created.id,
          enquiryId: created.id,
          title: body.name.trim() ? `Quote for ${body.name.trim()}` : "Quote raised on site",
          scope: "Quote raised on site",
        });
        enquiryId = created.id;
      }
    } else {
      const owned = await prisma.enquiry.findFirst({
        where: { id: enquiryId, clientId: clientId(req) },
        select: { id: true },
      });
      if (!owned) throw new ApiError(404, "not_found", "Customer not found");
    }

    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: { enquiryId },
      include: { lines: quoteLineInclude, enquiry: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}));

tradieRouter.get("/quotes", requireClient, async (req, res, next) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { clientId: clientId(req), status: { notIn: ["DELETED", "ARCHIVED"] } },
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


// ---- Customers (enquiries + manual contacts) ----
// ---- Customers ----
// Moved to routes/customers.ts. The list used to be computed here by bucketing
// enquiries on the last ten digits of a phone number; customers are real records
// now, so the derived versions have gone rather than lingering as dead routes.


// ---- Two-way SMS composer ----


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

    const body = z
      .object({
        returnPath: z.string().max(200).optional(),
        refreshPath: z.string().max(200).optional(),
      })
      .parse(req.body ?? {});

    const safePath = (p: string | undefined, fallback: string) => {
      if (!p || !p.startsWith("/t")) return fallback;
      return p;
    };

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
    const returnPath = safePath(body.returnPath, "/t/settings?connect=return");
    const refreshPath = safePath(body.refreshPath, "/t/settings?connect=refresh");
    const link = await createConnectOnboardingLink({
      accountId,
      refreshUrl: `${base}${refreshPath}`,
      returnUrl: `${base}${returnPath}`,
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

tradieRouter.post("/appointments", requireClient, requireActiveAccount, idempotent(async (req, res, next) => {
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
    let customerPhone = body.customerPhone ? toE164UK(body.customerPhone) : null;
    let address = body.address?.trim() || null;
    if (body.enquiryId) {
      const enq = await prisma.enquiry.findFirst({
        where: { id: body.enquiryId, clientId: clientId(req) },
      });
      if (enq) {
        customerName = customerName || enq.name;
        customerPhone = customerPhone || toE164UK(enq.phone);
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
}));

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

// ---- Certificates (file store + expiry reminders) ----
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
        kind: z.enum(["GAS_SAFETY", "MINOR_WORKS", "EICR", "OTHER"]),
        enquiryId: z.string().nullable().optional(),
        siteAddress: z.string().max(240).nullable().optional(),
        customerName: z.string().max(120).nullable().optional(),
        customerPhone: z.string().max(40).nullable().optional(),
        customerEmail: z.string().max(160).nullable().optional(),
        issuedAt: z.string().datetime().nullable().optional(),
        schemeRef: z.string().max(80).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        serviceDueAt: z.string().datetime().nullable().optional(),
        file: z
          .object({
            contentType: z.string().min(3).max(80),
            dataBase64: z.string().min(20),
          })
          .optional(),
      })
      .parse(req.body ?? {});
    const row = await createCertificate({
      clientId: clientId(req),
      kind: body.kind,
      enquiryId: body.enquiryId,
      siteAddress: body.siteAddress,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      schemeRef: body.schemeRef,
      notes: body.notes,
      issuedAt: body.issuedAt ? new Date(body.issuedAt) : null,
      serviceDueAt: body.serviceDueAt ? new Date(body.serviceDueAt) : null,
      file: body.file,
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
        kind: z.enum(["GAS_SAFETY", "MINOR_WORKS", "EICR", "OTHER"]).optional(),
        siteAddress: z.string().max(240).nullable().optional(),
        customerName: z.string().max(120).nullable().optional(),
        customerPhone: z.string().max(40).nullable().optional(),
        customerEmail: z.string().max(160).nullable().optional(),
        issuedAt: z.string().datetime().nullable().optional(),
        schemeRef: z.string().max(80).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        serviceDueAt: z.string().datetime().nullable().optional(),
        file: z
          .object({
            contentType: z.string().min(3).max(80),
            dataBase64: z.string().min(20),
          })
          .nullable()
          .optional(),
      })
      .parse(req.body ?? {});
    const row = await updateCertificate(clientId(req), req.params.id, {
      kind: body.kind,
      siteAddress: body.siteAddress,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      customerEmail: body.customerEmail,
      schemeRef: body.schemeRef,
      notes: body.notes,
      issuedAt: body.issuedAt === undefined ? undefined : body.issuedAt ? new Date(body.issuedAt) : null,
      serviceDueAt:
        body.serviceDueAt === undefined ? undefined : body.serviceDueAt ? new Date(body.serviceDueAt) : null,
      file: body.file,
    });
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
