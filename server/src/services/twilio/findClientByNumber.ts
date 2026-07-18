import { prisma } from "../../db.js";
import { toE164UK } from "../messaging/sender.js";

type ClientRow = NonNullable<Awaited<ReturnType<typeof prisma.client.findFirst>>>;

/**
 * Resolve client by Twilio number using normalized E.164 equality only
 * (no fuzzy contains / last-10 matching — avoids cross-tenant routing).
 */
export async function findClientByTwilioNumber(rawTo: string): Promise<ClientRow | null> {
  const e164 = toE164UK(rawTo);
  if (!e164) return null;

  const digits = e164.replace(/\D/g, "");
  const ukNational = digits.startsWith("44") && digits.length >= 12 ? `0${digits.slice(2)}` : null;

  const candidates = [e164, rawTo.trim(), digits ? `+${digits}` : null, ukNational].filter(
    (v, i, a): v is string => !!v && a.indexOf(v) === i
  );

  const hit = await prisma.client.findFirst({
    where: { twilioNumber: { in: candidates } },
  });
  if (hit) return hit;

  // Last resort: scan recent clients with a number and compare normalized form (bounded).
  const recent = await prisma.client.findMany({
    where: { twilioNumber: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  const matches = recent.filter((c) => c.twilioNumber && toE164UK(c.twilioNumber) === e164);
  return matches.length === 1 ? matches[0]! : null;
}
