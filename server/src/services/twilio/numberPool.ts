import { prisma } from "../../db.js";
import { configureNumberWebhooks } from "./numbers.js";
import type { Prisma } from "@prisma/client";

/** Add or refresh a spare number in the pool (AVAILABLE). */
export async function addNumberToPool(opts: {
  phoneNumber: string;
  sid: string;
  notes?: string | null;
}): Promise<{ id: string; phoneNumber: string; sid: string }> {
  const row = await prisma.twilioNumberPool.upsert({
    where: { sid: opts.sid },
    create: {
      phoneNumber: opts.phoneNumber,
      sid: opts.sid,
      status: "AVAILABLE",
      assignedClientId: null,
      notes: opts.notes ?? null,
    },
    update: {
      phoneNumber: opts.phoneNumber,
      status: "AVAILABLE",
      assignedClientId: null,
      notes: opts.notes ?? undefined,
    },
  });
  return { id: row.id, phoneNumber: row.phoneNumber, sid: row.sid };
}

/**
 * Atomically claim one AVAILABLE pool number for a client.
 * Returns null if the pool is empty.
 */
export async function claimNumberFromPool(opts: {
  clientId: string;
  friendlyName?: string;
}): Promise<{ phoneNumber: string; sid: string; fromPool: true } | null> {
  const claimed = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const spare = await tx.twilioNumberPool.findFirst({
      where: { status: "AVAILABLE" },
      orderBy: { createdAt: "asc" },
    });
    if (!spare) return null;

    // Ensure client still has no number (race with parallel provision)
    const client = await tx.client.findUnique({
      where: { id: opts.clientId },
      select: { twilioNumber: true },
    });
    if (!client) return null;
    if (client.twilioNumber) {
      return {
        alreadyHad: true as const,
        phoneNumber: client.twilioNumber,
        sid: null as string | null,
      };
    }

    await tx.twilioNumberPool.update({
      where: { id: spare.id },
      data: {
        status: "ASSIGNED",
        assignedClientId: opts.clientId,
      },
    });
    await tx.client.update({
      where: { id: opts.clientId },
      data: {
        twilioNumber: spare.phoneNumber,
        twilioNumberSid: spare.sid,
      },
    });
    return {
      alreadyHad: false as const,
      phoneNumber: spare.phoneNumber,
      sid: spare.sid,
    };
  });

  if (!claimed) return null;
  if (claimed.alreadyHad && claimed.phoneNumber) {
    // Another request won the race — treat as not a pool claim
    return null;
  }
  if (!claimed.sid || !claimed.phoneNumber) return null;

  try {
    await configureNumberWebhooks(claimed.phoneNumber);
  } catch (e) {
    console.warn("[number-pool] configure webhooks failed", claimed.phoneNumber, e);
  }

  return { phoneNumber: claimed.phoneNumber, sid: claimed.sid, fromPool: true };
}

/** Detach a client's number and return it to the AVAILABLE pool. */
export async function releaseClientNumberToPool(
  clientId: string,
  notes?: string
): Promise<{ phoneNumber: string; sid: string } | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { twilioNumber: true, twilioNumberSid: true },
  });
  if (!client?.twilioNumber || !client.twilioNumberSid) return null;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.client.update({
      where: { id: clientId },
      data: { twilioNumber: null, twilioNumberSid: null },
    });
    await tx.twilioNumberPool.upsert({
      where: { sid: client.twilioNumberSid! },
      create: {
        phoneNumber: client.twilioNumber!,
        sid: client.twilioNumberSid!,
        status: "AVAILABLE",
        assignedClientId: null,
        notes: notes ?? "Released from client",
      },
      update: {
        phoneNumber: client.twilioNumber!,
        status: "AVAILABLE",
        assignedClientId: null,
        notes: notes ?? "Released from client",
      },
    });
  });

  return { phoneNumber: client.twilioNumber, sid: client.twilioNumberSid };
}

export async function countAvailablePoolNumbers(): Promise<number> {
  return prisma.twilioNumberPool.count({ where: { status: "AVAILABLE" } });
}
