import { Router } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { ApiError } from "../middleware/error.js";
import { createAndSendOtp, verifyOtp } from "../services/auth/otp.js";
import { sendMessage, toE164UK } from "../services/messaging/sender.js";
import { ensurePriceBook } from "../services/quotes/priceBook.js";
import { appPublicUrl, newSessionToken, hashToken } from "../services/quotes/magicAuth.js";
import { notifyEarlyAccessRequest, sendEmail } from "../services/email/send.js";

export const signupRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function newRouteKey(): string {
  return `tm_${randomBytes(4).toString("hex")}`;
}

function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
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

async function loadValidInvite(rawToken: string | undefined | null) {
  const token = String(rawToken || "").trim();
  if (!token) return null;
  const row = await prisma.earlyAccessRequest.findUnique({
    where: { inviteTokenHash: hashToken(`invite:${token}`) },
  });
  if (!row || row.status !== "APPROVED") return null;
  if (row.inviteUsedAt) return null;
  if (!row.inviteExpiresAt || row.inviteExpiresAt.getTime() < Date.now()) return null;
  return { row, rawToken: token };
}

signupRouter.get("/status", (_req, res) => {
  res.json({ open: env.SIGNUPS_OPEN });
});

signupRouter.post("/early-access", async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email().max(200),
        phone: z.string().min(8).max(20),
        occupation: z.string().min(2).max(80),
      })
      .parse(req.body ?? {});

    const phone = toE164UK(body.phone);
    const email = body.email.trim().toLowerCase();
    const occupation = body.occupation.trim();

    const existingPending = await prisma.earlyAccessRequest.findFirst({
      where: {
        status: "PENDING",
        OR: [{ email }, { phone: { contains: phone.replace(/\D/g, "").slice(-10) } }],
      },
      orderBy: { createdAt: "desc" },
    });
    if (existingPending) {
      res.json({ ok: true, alreadyPending: true });
      return;
    }

    const row = await prisma.earlyAccessRequest.create({
      data: { email, phone, occupation },
    });

    void notifyEarlyAccessRequest({
      email: row.email,
      phone: row.phone,
      occupation: row.occupation,
      requestId: row.id,
    }).catch((e) => console.warn("[early-access notify]", e));

    res.json({ ok: true, alreadyPending: false });
  } catch (err) {
    next(err);
  }
});

signupRouter.get("/invite/:token", async (req, res, next) => {
  try {
    const invite = await loadValidInvite(req.params.token);
    if (!invite) throw new ApiError(404, "invalid_invite", "This invite link is invalid or has expired");
    res.json({
      email: invite.row.email,
      phone: invite.row.phone,
      occupation: invite.row.occupation,
      expiresAt: invite.row.inviteExpiresAt,
    });
  } catch (err) {
    next(err);
  }
});

signupRouter.post("/start", async (req, res, next) => {
  try {
    const body = z
      .object({
        businessName: z.string().min(2).max(120),
        tradeTitle: z.string().max(80).optional(),
        town: z.string().max(80).optional(),
        phone: z.string().min(8).max(20),
        inviteToken: z.string().optional(),
      })
      .parse(req.body ?? {});

    const invite = await loadValidInvite(body.inviteToken);
    if (!env.SIGNUPS_OPEN && !invite) {
      throw new ApiError(
        403,
        "signups_closed",
        "TradiesMate is in private beta — request early access from the homepage, or use a valid invite link."
      );
    }

    const phone = toE164UK(body.phone);
    if (invite && invite.row.phone.replace(/\D/g, "").slice(-10) !== phone.replace(/\D/g, "").slice(-10)) {
      throw new ApiError(403, "invite_phone_mismatch", "Use the same mobile number you requested access with");
    }

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
        tradeTitle: body.tradeTitle?.trim() || invite?.row.occupation || null,
        town: body.town?.trim() || null,
        phone,
        inviteToken: invite?.rawToken || null,
        inviteEmail: invite?.row.email || null,
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
        inviteToken: z.string().optional(),
      })
      .parse(req.body ?? {});

    const challenge = await verifyOtp(body.phone, body.code, "signup");
    if (!challenge) throw new ApiError(401, "invalid_otp", "Invalid or expired code");

    const payload = (challenge.payload || {}) as {
      businessName?: string;
      tradeTitle?: string | null;
      town?: string | null;
      phone?: string;
      inviteToken?: string | null;
      inviteEmail?: string | null;
    };
    if (!payload.businessName || !payload.phone) {
      throw new ApiError(400, "bad_payload", "Signup data missing — start again");
    }

    const inviteToken = body.inviteToken || payload.inviteToken || undefined;
    const invite = await loadValidInvite(inviteToken);
    if (!env.SIGNUPS_OPEN && !invite) {
      throw new ApiError(403, "signups_closed", "Invite required — request early access from the homepage");
    }

    const trialEndsAt = new Date(Date.now() + env.TRIAL_DAYS * 24 * 60 * 60 * 1000);
    let routeKey = newRouteKey();
    for (let i = 0; i < 5; i++) {
      const clash = await prisma.client.findUnique({ where: { routeKey } });
      if (!clash) break;
      routeKey = newRouteKey();
    }

    const local =
      payload.businessName
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

    if (invite) {
      await prisma.earlyAccessRequest.update({
        where: { id: invite.row.id },
        data: { inviteUsedAt: new Date() },
      });
    }

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

/** Used by admin approve — kept here so invite hashing stays in one place. */
export async function approveEarlyAccessRequest(id: string) {
  const row = await prisma.earlyAccessRequest.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "not_found", "Request not found");
  if (row.status === "DENIED") throw new ApiError(400, "denied", "Request was denied");
  if (row.status === "APPROVED" && row.inviteTokenHash && row.inviteExpiresAt && row.inviteExpiresAt > new Date() && !row.inviteUsedAt) {
    throw new ApiError(400, "already_approved", "Invite already sent — wait for them to sign up or deny and re-request");
  }

  const rawToken = newInviteToken();
  const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const updated = await prisma.earlyAccessRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      inviteTokenHash: hashToken(`invite:${rawToken}`),
      inviteExpiresAt,
      inviteSentAt: new Date(),
      inviteUsedAt: null,
    },
  });

  const url = `${appPublicUrl()}/signup?invite=${encodeURIComponent(rawToken)}`;
  const smsBody = `You're in — TradiesMate early access.\n\nCreate your account (one-time link, 7 days):\n${url}`;
  await sendMessage({ to: updated.phone, channel: "SMS", body: smsBody });
  await sendEmail({
    to: updated.email,
    subject: "Your TradiesMate early access invite",
    text: `You're invited to try TradiesMate.\n\nThis link works once and expires in 7 days:\n${url}\n\nUse the same mobile you applied with.`,
  });

  return { id: updated.id, inviteExpiresAt, inviteUrl: url };
}
