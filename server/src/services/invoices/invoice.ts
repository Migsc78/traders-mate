import { prisma } from "../../db.js";
import { newPublicToken } from "../quotes/magicAuth.js";
import { formatGbp } from "../quotes/money.js";
import { sendMessage } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";
import { appPublicUrl } from "../quotes/magicAuth.js";
import { ApiError } from "../../middleware/error.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function createInvoiceFromQuote(clientId: string, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, clientId },
    include: { lines: { orderBy: { sort: "asc" } }, enquiry: true, client: true },
  });
  if (!quote) throw new ApiError(404, "not_found", "Quote not found");
  if (quote.status !== "ACCEPTED" && quote.status !== "SENT") {
    throw new ApiError(400, "bad_status", "Quote must be sent or accepted to invoice");
  }

  const dueDate = new Date(Date.now() + 7 * DAY_MS);
  const reference = `INV-${Date.now().toString(36).toUpperCase()}`;
  const invoice = await prisma.invoice.create({
    data: {
      clientId,
      quoteId: quote.id,
      enquiryId: quote.enquiryId,
      status: "DRAFT",
      publicToken: newPublicToken(),
      customerName: quote.enquiry?.name,
      customerPhone: quote.enquiry?.phone,
      vatInclusive: quote.vatInclusive,
      subtotalPence: quote.subtotalPence,
      vatPence: quote.vatPence,
      totalPence: quote.totalPence,
      dueDate,
      reference,
      bankName: quote.client.bankName,
      bankSortCode: quote.client.bankSortCode,
      bankAccountName: quote.client.bankAccountName,
      bankAccountNumber: quote.client.bankAccountNumber,
      customerNote: quote.customerNote,
      lines: {
        create: quote.lines.map((l, i) => ({
          sort: i,
          label: l.label,
          qty: l.qty,
          unit: l.unit,
          unitPricePence: l.unitPricePence,
          vatRate: l.vatRate,
        })),
      },
    },
    include: { lines: { orderBy: { sort: "asc" } } },
  });
  return invoice;
}

export async function sendInvoice(clientId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, clientId },
    include: { client: true, lines: true },
  });
  if (!invoice) throw new ApiError(404, "not_found", "Invoice not found");
  if (!invoice.customerPhone) throw new ApiError(400, "no_phone", "Invoice has no customer phone");
  if (invoice.status === "VOID" || invoice.status === "PAID") {
    throw new ApiError(400, "bad_status", `Invoice is ${invoice.status}`);
  }

  const url = `${appPublicUrl()}/i/${invoice.publicToken}`;
  const body = `${invoice.client.businessName}: invoice ${invoice.reference || ""} for ${formatGbp(invoice.totalPence)}. Pay by bank transfer — details: ${url}`;

  const results = await sendMessage({ to: invoice.customerPhone, channel: "SMS", body });
  await logMessage({
    clientId,
    enquiryId: invoice.enquiryId,
    direction: "OUTBOUND",
    toAddr: invoice.customerPhone,
    body,
    twilioSid: results[0]?.id,
  });

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "SENT", sentAt: new Date() },
    include: { lines: { orderBy: { sort: "asc" } } },
  });

  await prisma.followUp.deleteMany({ where: { invoiceId: invoice.id, status: "PENDING" } });
  const sentAt = new Date();
  await prisma.followUp.createMany({
    data: [
      { invoiceId: invoice.id, kind: "INVOICE_D3", runAt: new Date(sentAt.getTime() + 3 * DAY_MS), status: "PENDING" },
      { invoiceId: invoice.id, kind: "INVOICE_D7", runAt: new Date(sentAt.getTime() + 7 * DAY_MS), status: "PENDING" },
    ],
  });

  return { invoice: updated, publicUrl: url };
}

export async function markInvoicePaid(clientId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, clientId } });
  if (!invoice) throw new ApiError(404, "not_found", "Invoice not found");
  await prisma.followUp.updateMany({
    where: { invoiceId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: "PAID", paidAt: new Date() },
    include: { lines: { orderBy: { sort: "asc" } } },
  });
}
