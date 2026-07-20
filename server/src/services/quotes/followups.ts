import { prisma } from "../../db.js";
import { sendMessage } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";
import { formatGbp } from "./money.js";
import { appPublicUrl } from "./magicAuth.js";
import { sendReviewSms } from "../reviews/reviews.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function scheduleQuoteFollowUps(quoteId: string, sentAt = new Date()) {
  await prisma.followUp.deleteMany({ where: { quoteId, status: "PENDING", kind: { in: ["QUOTE_D2", "QUOTE_D5", "QUOTE_D10"] } } });
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
    where: { quoteId, status: "PENDING", kind: { in: ["QUOTE_D2", "QUOTE_D5", "QUOTE_D10"] } },
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
  if (kind === "INVOICE_D3") {
    return `Reminder from ${business}: invoice ${money} is due soon. Pay here: ${url}`;
  }
  if (kind === "INVOICE_D7") {
    return `Overdue reminder from ${business}: please pay ${money}. Pay here: ${url}`;
  }
  return `Final reminder from ${business} about your quote (${money}). It will expire soon: ${url}`;
}

/** Process due follow-ups. Safe to call on an interval. */
export async function tickFollowUps(limit = 30): Promise<{ sent: number; expired: number }> {
  const due = await prisma.followUp.findMany({
    where: { status: "PENDING", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: limit,
    include: {
      quote: { include: { client: true, enquiry: true } },
      invoice: { include: { client: true } },
      appointment: { include: { client: true } },
      certificate: { include: { client: true } },
    },
  });

  let sent = 0;
  let expired = 0;

  for (const fu of due) {
    try {
      // Reviews
      if (fu.kind === "REVIEW_ASK" || fu.kind === "REVIEW_NUDGE") {
        const inv = fu.invoice;
        if (!inv?.customerPhone || !inv.client.googleReviewUrl) {
          await prisma.followUp.update({ where: { id: fu.id }, data: { status: "SKIPPED" } });
          continue;
        }
        await sendReviewSms({
          clientId: inv.clientId,
          enquiryId: inv.enquiryId,
          phone: inv.customerPhone,
          businessName: inv.client.businessName,
          reviewUrl: inv.client.googleReviewUrl,
          nudge: fu.kind === "REVIEW_NUDGE",
        });
        await prisma.followUp.update({
          where: { id: fu.id },
          data: { status: "SENT", sentAt: new Date() },
        });
        sent += 1;
        continue;
      }

      // Appointment reminder
      if (fu.kind === "APPT_REMINDER" && fu.appointment) {
        const a = fu.appointment;
        if (!a.customerPhone || a.status === "CANCELLED" || a.status === "DONE") {
          await prisma.followUp.update({ where: { id: fu.id }, data: { status: "SKIPPED" } });
          continue;
        }
        const when = a.startsAt.toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        const body = `${a.client.businessName}: reminder — we're due ${when}${a.address ? ` at ${a.address}` : ""}. Reply if you need to rearrange.`;
        const results = await sendMessage({ to: a.customerPhone, channel: "SMS", body });
        await logMessage({
          clientId: a.clientId,
          enquiryId: a.enquiryId,
          direction: "OUTBOUND",
          toAddr: a.customerPhone,
          body,
          twilioSid: results[0]?.id,
        });
        await prisma.followUp.update({
          where: { id: fu.id },
          data: { status: "SENT", sentAt: new Date(), bodySnapshot: body.slice(0, 500) },
        });
        sent += 1;
        continue;
      }

      // Annual service reminder from certificate
      if (fu.kind === "SERVICE_REMINDER" && fu.certificate) {
        const c = fu.certificate;
        if (!c.customerPhone) {
          await prisma.followUp.update({ where: { id: fu.id }, data: { status: "SKIPPED" } });
          continue;
        }
        const body = `${c.client.businessName}: your annual service / safety check is due soon. Reply YES to book a visit.`;
        const results = await sendMessage({ to: c.customerPhone, channel: "SMS", body });
        await logMessage({
          clientId: c.clientId,
          enquiryId: c.enquiryId,
          direction: "OUTBOUND",
          toAddr: c.customerPhone,
          body,
          twilioSid: results[0]?.id,
        });
        await prisma.followUp.update({
          where: { id: fu.id },
          data: { status: "SENT", sentAt: new Date(), bodySnapshot: body.slice(0, 500) },
        });
        sent += 1;
        continue;
      }

      if (fu.kind.startsWith("INVOICE_") && fu.invoice) {
        const inv = fu.invoice;
        if (inv.status === "PAID" || inv.status === "VOID" || !inv.customerPhone) {
          await prisma.followUp.update({ where: { id: fu.id }, data: { status: "SKIPPED" } });
          continue;
        }
        const amount = inv.amountDuePence > 0 ? inv.amountDuePence : inv.totalPence;
        const url = `${appPublicUrl()}/i/${inv.publicToken}`;
        const body = chaseBody(fu.kind, inv.client.businessName, amount, url);
        const results = await sendMessage({ to: inv.customerPhone, channel: "SMS", body });
        await logMessage({
          clientId: inv.clientId,
          enquiryId: inv.enquiryId,
          direction: "OUTBOUND",
          toAddr: inv.customerPhone,
          body,
          twilioSid: results[0]?.id,
        });
        await prisma.followUp.update({
          where: { id: fu.id },
          data: { status: "SENT", sentAt: new Date(), bodySnapshot: body.slice(0, 500) },
        });
        if (fu.kind === "INVOICE_D7" && inv.status === "SENT") {
          await prisma.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
        }
        sent += 1;
        continue;
      }

      const q = fu.quote;
      if (!q || q.status !== "SENT" || !q.enquiry?.phone) {
        await prisma.followUp.update({ where: { id: fu.id }, data: { status: "SKIPPED" } });
        continue;
      }

      const url = `${appPublicUrl()}/q/${q.publicToken}`;
      const body = chaseBody(fu.kind, q.client.businessName, q.totalPence, url);
      const results = await sendMessage({ to: q.enquiry.phone, channel: "SMS", body });
      await logMessage({
        clientId: q.clientId,
        enquiryId: q.enquiryId,
        direction: "OUTBOUND",
        toAddr: q.enquiry.phone,
        body,
        twilioSid: results[0]?.id,
      });
      await prisma.followUp.update({
        where: { id: fu.id },
        data: { status: "SENT", sentAt: new Date(), bodySnapshot: body.slice(0, 500) },
      });
      sent += 1;

      if (fu.kind === "QUOTE_D10") {
        await prisma.quote.update({ where: { id: q.id }, data: { status: "EXPIRED" } });
        await cancelQuoteFollowUps(q.id);
        expired += 1;
      }
    } catch (e) {
      console.warn("[followups] tick item failed", fu.id, e instanceof Error ? e.message : e);
    }
  }

  return { sent, expired };
}
