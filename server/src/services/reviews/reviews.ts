import { prisma } from "../../db.js";
import { sendMessage } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Schedule review ask (+ optional nudge) after an invoice is paid. */
export async function scheduleReviewAsk(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: true },
  });
  if (!invoice?.customerPhone) return;
  if (!invoice.client.googleReviewUrl) return;
  if (invoice.reviewAskedAt) return;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { reviewAskedAt: new Date() },
  });

  const now = new Date();
  await prisma.followUp.createMany({
    data: [
      {
        invoiceId,
        clientId: invoice.clientId,
        enquiryId: invoice.enquiryId,
        kind: "REVIEW_ASK",
        runAt: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2h
        status: "PENDING",
      },
      {
        invoiceId,
        clientId: invoice.clientId,
        enquiryId: invoice.enquiryId,
        kind: "REVIEW_NUDGE",
        runAt: new Date(now.getTime() + 2 * DAY_MS),
        status: "PENDING",
      },
    ],
  });
}

export async function sendReviewSms(opts: {
  clientId: string;
  enquiryId?: string | null;
  phone: string;
  businessName: string;
  reviewUrl: string;
  nudge?: boolean;
}) {
  const body = opts.nudge
    ? `Hi — just a quick reminder from ${opts.businessName}. If you're happy with the work, a Google review means a lot: ${opts.reviewUrl}`
    : `Thanks for choosing ${opts.businessName}! If you're happy with the job, please leave a quick Google review: ${opts.reviewUrl}`;
  const results = await sendMessage({ to: opts.phone, channel: "SMS", body });
  await logMessage({
    clientId: opts.clientId,
    enquiryId: opts.enquiryId,
    direction: "OUTBOUND",
    toAddr: opts.phone,
    body,
    twilioSid: results[0]?.id,
  });
  return results;
}
