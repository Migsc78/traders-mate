import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { ApiError } from "../middleware/error.js";
import { createAndSendOtp, verifyOtp } from "../services/auth/otp.js";
import { toE164UK } from "../services/messaging/sender.js";
import { ensurePriceBook } from "../services/quotes/priceBook.js";
import { newSessionToken, hashToken } from "../services/quotes/magicAuth.js";

export const signupRouter = Router();

function newRouteKey(): string {
  return `tm_${randomBytes(4).toString("hex")}`;
}

async function createSession(clientId: string) {
  const sessionToken = newSessionToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  await prisma.clientSession.create({
    data: {
      clientId,
      tokenHash: hashToken(`session:${sessionToken}`),
      expiresAt,
    },
  });
  return { sessionToken, expiresAt };
}

signupRouter.post("/start", async (req, res, next) => {
  try {
    const body = z
      .object({
        businessName: z.string().min(2).max(120),
        tradeTitle: z.string().max(80).optional(),
        town: z.string().max(80).optional(),
        phone: z.string().min(8).max(20),
      })
      .parse(req.body ?? {});

    const phone = toE164UK(body.phone);
    const existing = await prisma.client.findFirst({
      where: { destPhone: { contains: phone.replace(/\D/g, "").slice(-10) } },
    });
    if (existing) {
      throw new ApiError(409, "exists", "An account with this phone already exists — use login instead");
    }

    const { expiresAt } = await createAndSendOtp({
      phone,
      purpose: "signup",
      payload: {
        businessName: body.businessName.trim(),
        tradeTitle: body.tradeTitle?.trim() || null,
        town: body.town?.trim() || null,
        phone,
      },
    });

    res.json({ ok: true, expiresAt });
  } catch (err) {
    next(err);
  }
});

signupRouter.post("/verify", async (req, res, next) => {
  try {
    const body = z
      .object({
        phone: z.string().min(8),
        code: z.string().min(4).max(8),
      })
      .parse(req.body ?? {});

    const challenge = await verifyOtp(body.phone, body.code, "signup");
    if (!challenge) throw new ApiError(401, "invalid_otp", "Invalid or expired code");

    const payload = (challenge.payload || {}) as {
      businessName?: string;
      tradeTitle?: string | null;
      town?: string | null;
      phone?: string;
    };
    if (!payload.businessName || !payload.phone) {
      throw new ApiError(400, "bad_payload", "Signup data missing — start again");
    }

    const trialEndsAt = new Date(Date.now() + env.TRIAL_DAYS * 24 * 60 * 60 * 1000);
    let routeKey = newRouteKey();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.client.findUnique({ where: { routeKey } });
      if (!clash) break;
      routeKey = newRouteKey();
    }

    const local = payload.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "tradie";
    let inboundEmailLocal = local;
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.client.findUnique({ where: { inboundEmailLocal } });
      if (!clash) break;
      inboundEmailLocal = `${local}${i + 2}`;
    }

    const client = await prisma.client.create({
      data: {
        businessName: payload.businessName,
        tradeTitle: payload.tradeTitle,
        town: payload.town,
        destPhone: payload.phone,
        destChannel: "SMS",
        routeKey,
        status: "TRIAL",
        phoneVerifiedAt: new Date(),
        trialEndsAt,
        inboundEmailLocal,
      },
    });

    await ensurePriceBook(client.id, client.tradeTitle);
    const session = await createSession(client.id);

    res.json({
      sessionToken: session.sessionToken,
      clientId: client.id,
      routeKey: client.routeKey,
      trialEndsAt: client.trialEndsAt,
      inboundEmail: `${client.inboundEmailLocal}@${env.INBOUND_EMAIL_DOMAIN}`,
    });
  } catch (err) {
    next(err);
  }
});

signupRouter.post("/login/start", async (req, res, next) => {
  try {
    const body = z.object({ phone: z.string().min(8) }).parse(req.body ?? {});
    const phone = toE164UK(body.phone);
    const client = await prisma.client.findFirst({
      where: { destPhone: { contains: phone.replace(/\D/g, "").slice(-10) } },
      orderBy: { createdAt: "desc" },
    });
    if (!client) throw new ApiError(404, "not_found", "No account for this phone");
    if (client.status === "CANCELLED") throw new ApiError(403, "cancelled", "Account cancelled");

    const { expiresAt } = await createAndSendOtp({
      phone: client.destPhone,
      purpose: "login",
      clientId: client.id,
    });
    res.json({ ok: true, expiresAt });
  } catch (err) {
    next(err);
  }
});

signupRouter.post("/login/verify", async (req, res, next) => {
  try {
    const body = z
      .object({ phone: z.string().min(8), code: z.string().min(4).max(8) })
      .parse(req.body ?? {});

    const challenge = await verifyOtp(body.phone, body.code, "login");
    if (!challenge?.clientId) throw new ApiError(401, "invalid_otp", "Invalid or expired code");

    const client = await prisma.client.findUnique({ where: { id: challenge.clientId } });
    if (!client) throw new ApiError(404, "not_found", "Account not found");

    await prisma.client.update({
      where: { id: client.id },
      data: { phoneVerifiedAt: client.phoneVerifiedAt ?? new Date() },
    });

    await ensurePriceBook(client.id, client.tradeTitle);
    const session = await createSession(client.id);
    res.json({
      sessionToken: session.sessionToken,
      clientId: client.id,
      routeKey: client.routeKey,
      status: client.status,
      trialEndsAt: client.trialEndsAt,
    });
  } catch (err) {
    next(err);
  }
});
