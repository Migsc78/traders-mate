import { createHash, randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { env } from "../../env.js";
import { sendMessage, toE164UK } from "../messaging/sender.js";

const OTP_TTL_MS = 10 * 60 * 1000;

export function hashOtp(phone: string, code: string): string {
  return createHash("sha256").update(`${env.MAGIC_LINK_SECRET}:otp:${phone}:${code}`).digest("hex");
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export async function createAndSendOtp(opts: {
  phone: string;
  purpose: "signup" | "login";
  clientId?: string;
  payload?: Prisma.InputJsonValue;
}): Promise<{ expiresAt: Date }> {
  const phone = toE164UK(opts.phone);
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.otpChallenge.updateMany({
    where: { phone, purpose: opts.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  await prisma.otpChallenge.create({
    data: {
      phone,
      purpose: opts.purpose,
      codeHash: hashOtp(phone, code),
      clientId: opts.clientId,
      payload: opts.payload,
      expiresAt,
    },
  });

  await sendMessage({
    to: phone,
    channel: "SMS",
    body: `Your TradiesMate code is ${code}. It expires in 10 minutes.`,
  });

  return { expiresAt };
}

export async function verifyOtp(phoneRaw: string, code: string, purpose: "signup" | "login") {
  const phone = toE164UK(phoneRaw);
  const row = await prisma.otpChallenge.findFirst({
    where: {
      phone,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  if (row.codeHash !== hashOtp(phone, code.trim())) return null;
  await prisma.otpChallenge.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return row;
}
