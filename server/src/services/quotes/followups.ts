import { prisma } from "../../db.js";
import { sendMessage } from "../messaging/sender.js";
import { formatGbp } from "./money.js";
import { appPublicUrl } from "./magicAuth.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function scheduleQuoteFollowUps(quoteId: string, sentAt = new Date()) {
  await prisma.followUp.deleteMany({ where: { quoteId, status: "PENDING" } });
  const kinds = [
    { kind: "QUOTE_D2" as const, at: new Date(sentAt.getTime() + 2 * DAY_MS) },
    { kind: "QUOTE_D5" as const, at: new Date(sentAt.getTime() + 5 * DAY_MS) },
    { kind: "QUOTE_D10" as const, at: new Date(sentAt.getTime() + 10 * DAY_MS) },
  ];
  await prisma.followUp.createMany({
    data: kinds.map((k) => ({ quoteId, kind: k.kind, runAt: k.at, status: "PENDING" })),
  });
}

export async function cancelQuoteFollowUps(quoteId: string) {
  await prisma.followUp.updateMany({
    where: { quoteId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}

function chaseBody(kind: string, business: string, totalPence: number, url: string): string {
  const money = formatGbp(totalPence);
  if (kind === "QUOTE_D2") {
    return `Hi, just checking you saw the quote from ${business} (${money}). View or accept here: ${url}`;
  }
  if (kind === "QUOTE_D5") {
    return `Friendly reminder from ${business} — your quote (${money}) is still open: ${url}`;
  }
  return `Final reminder from ${business} about your quote (${money}). It will expire soon: ${url}`;
}

/** Process due follow-ups. Safe to call on an interval. */
export async function tickFollowUps(limit = 20): Promise<{ sent: number; expired: number }> {
  const due = await prisma.followUp.findMany({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: limit,
    include: {
      quote: {
        include: {
          client: true,
          enquiry: true,
        },
      },
    },
  });

  let sent = 0;
  let expired = 0;

  for (const fu of due) {
    const q = fu.quote;
    if (!q || q.status !== "SENT" || !q.enquiry?.phone) {
      await prisma.followUp.update({ where: { id: fu.id }, data: { status: "SKIPPED" } });
      continue;
    }

    const url = `${appPublicUrl()}/q/${q.publicToken}`;
    const body = chaseBody(fu.kind, q.client.businessName, q.totalPence, url);
    try {
      await sendMessage({ to: q.enquiry.phone, channel: "SMS", body });
      await prisma.followUp.update({
        where: { id: fu.id },
        data: { status: "SENT", sentAt: new Date(), bodySnapshot: body.slice(0, 500) },
      });
      sent += 1;
    } catch {
      // leave PENDING for retry next tick
      continue;
    }

    if (fu.kind === "QUOTE_D10") {
      await prisma.quote.update({ where: { id: q.id }, data: { status: "EXPIRED" } });
      await cancelQuoteFollowUps(q.id);
      expired += 1;
    }
  }

  return { sent, expired };
}
