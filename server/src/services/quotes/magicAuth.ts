import { createHash, randomBytes } from "node:crypto";
import { env } from "../../env.js";
import { prisma } from "../../db.js";

const SESSION_DAYS = 14;
const MAGIC_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REDEMPTION_GRACE_MS = 5 * 60 * 1000;

/** Replay-safe cache for duplicate consume requests (e.g. React StrictMode double-mount). */
const recentRedemptions = new Map<string, { sessionToken: string; clientId: string; at: number }>();

function rememberRedemption(magicHash: string, result: { sessionToken: string; clientId: string }) {
  recentRedemptions.set(magicHash, { ...result, at: Date.now() });
  for (const [hash, row] of recentRedemptions) {
    if (Date.now() - row.at > REDEMPTION_GRACE_MS) recentRedemptions.delete(hash);
  }
}

function getRecentRedemption(magicHash: string): { sessionToken: string; clientId: string } | null {
  const hit = recentRedemptions.get(magicHash);
  if (!hit) return null;
  if (Date.now() - hit.at > REDEMPTION_GRACE_MS) {
    recentRedemptions.delete(magicHash);
    return null;
  }
  return { sessionToken: hit.sessionToken, clientId: hit.clientId };
}

export function appPublicUrl(): string {
  const fromEnv = env.APP_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  // CLIENT_ORIGIN may be comma-separated (local + Vercel). Prefer a non-localhost origin for SMS links.
  const origins = env.CLIENT_ORIGIN.split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const preferred =
    origins.find((o) => !/localhost|127\.0\.0\.1/i.test(o)) ?? origins[0] ?? "http://localhost:5173";
  return preferred;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(`${env.MAGIC_LINK_SECRET}:${raw}`).digest("hex");
}

export function newPublicToken(): string {
  return randomBytes(24).toString("base64url");
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Short-lived magic login payload stored only as a hash in ClientSession with short expiry. */
export async function createMagicLogin(clientId: string): Promise<{ rawToken: string; url: string; expiresAt: Date }> {
  const rawToken = newSessionToken();
  const expiresAt = new Date(Date.now() + MAGIC_TTL_MS);
  await prisma.clientSession.create({
    data: {
      clientId,
      tokenHash: hashToken(`magic:${rawToken}`),
      expiresAt,
    },
  });
  const url = `${appPublicUrl()}/t/auth?token=${encodeURIComponent(rawToken)}`;
  return { rawToken, url, expiresAt };
}

export async function consumeMagicToken(rawToken: string): Promise<{ sessionToken: string; clientId: string } | null> {
  const magicHash = hashToken(`magic:${rawToken.trim()}`);
  const cached = getRecentRedemption(magicHash);
  if (cached) return cached;

  const row = await prisma.clientSession.findUnique({ where: { tokenHash: magicHash } });
  if (!row) return getRecentRedemption(magicHash);
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.clientSession.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }

  const sessionToken = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const redeemed = await prisma.$transaction(async (tx) => {
    const deleted = await tx.clientSession.deleteMany({ where: { id: row.id, tokenHash: magicHash } });
    if (deleted.count === 0) return false;
    await tx.clientSession.create({
      data: {
        clientId: row.clientId,
        tokenHash: hashToken(`session:${sessionToken}`),
        expiresAt,
      },
    });
    return true;
  });

  if (!redeemed) return getRecentRedemption(magicHash);

  const result = { sessionToken, clientId: row.clientId };
  rememberRedemption(magicHash, result);
  return result;
}

export async function resolveSession(sessionToken: string | null | undefined): Promise<{ clientId: string } | null> {
  if (!sessionToken) return null;
  const row = await prisma.clientSession.findUnique({
    where: { tokenHash: hashToken(`session:${sessionToken}`) },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) await prisma.clientSession.delete({ where: { id: row.id } }).catch(() => undefined);
    return null;
  }
  await prisma.clientSession.update({
    where: { id: row.id },
    data: { lastSeenAt: new Date() },
  });
  return { clientId: row.clientId };
}

export function jobDeepLink(enquiryId: string, magicUrl?: string): string {
  if (magicUrl) return magicUrl.replace(/\/t\/auth.*/, `/t/jobs/${enquiryId}`);
  return `${appPublicUrl()}/t/jobs/${enquiryId}`;
}
