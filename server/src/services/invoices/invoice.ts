import { prisma } from "../../db.js";
import { newPublicToken } from "../quotes/magicAuth.js";
import { formatGbp } from "../quotes/money.js";
import { sendMessage } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";
import { appPublicUrl } from "../quotes/magicAuth.js";
import { ApiError } from "../../middleware/error.js";
import { renderMoneyPdf } from "../docs/pdf.js";
import { scheduleReviewAsk } from "../reviews/reviews.js";
import { createConnectPaymentCheckout } from "../billing/connect.js";

const DAY_MS = 24 * 60 * 60 * 1000;

async function logoUrlForClient(clientId: string): Promise<string | null> {
  const logo = await prisma.clientAsset.findFirst({
    where: { clientId, kind: "LOGO" },
    orderBy: { createdAt: "desc" },
  });
  return logo?.url || null;
}

export async function createInvoiceFromQuote(clientId: string, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, clientId },
    include: { lines: { orderBy: { sort: "asc" } }, enquiry: true, client: true },
  });
  if (!quote) throw new ApiError(404, "not_found", "Quote not found");
  if (quote.status !== "ACCEPTED" && quote.status !== "SENT") {
    throw new ApiError(400, "bad_status", "Quote must be sent or accepted to invoice");
  }

  const depositApplied = quote.depositPaidAt ? quote.depositPence : 0;
  const amountDue = Math.max(0, quote.totalPence - depositApplied);

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
      depositAppliedPence: depositApplied,
      amountDuePence: amountDue,
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

  const amountDue = invoice.amountDuePence > 0 ? invoice.amountDuePence : invoice.totalPence;
  const url = `${appPublicUrl()}/i/${invoice.publicToken}`;
  const body = `${invoice.client.businessName}: invoice ${invoice.reference || ""} for ${formatGbp(amountDue)}. Pay here: ${url}`;

  // Generate PDF (best-effort)
  let pdfUrl = invoice.pdfUrl;
  try {
    const logo = await logoUrlForClient(clientId);
    const pdf = await renderMoneyPdf({
      kind: "invoice",
      businessName: invoice.client.businessName,
      vatNumber: invoice.client.vatNumber,
      customerName: invoice.customerName,
      reference: invoice.reference,
      lines: invoice.lines.map((l) => ({
        label: l.label,
        qty: l.qty,
        unitPricePence: l.unitPricePence,
      })),
      subtotalPence: invoice.subtotalPence,
      vatPence: invoice.vatPence,
      totalPence: invoice.totalPence,
      amountDuePence: amountDue,
      depositAppliedPence: invoice.depositAppliedPence,
      bankName: invoice.bankName,
      bankSortCode: invoice.bankSortCode,
      bankAccountName: invoice.bankAccountName,
      bankAccountNumber: invoice.bankAccountNumber,
      note: invoice.customerNote,
      logoUrl: logo,
      dueDate: invoice.dueDate,
    });
    pdfUrl = pdf.url;
  } catch (e) {
    console.warn("[invoice] pdf failed", e instanceof Error ? e.message : e);
  }

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
    data: {
      status: "SENT",
      sentAt: new Date(),
      amountDuePence: amountDue,
      ...(pdfUrl ? { pdfUrl } : {}),
    },
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

export async function markInvoicePaid(
  clientId: string,
  invoiceId: string,
  opts?: { paidVia?: string; stripePaymentIntentId?: string | null }
) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, clientId } });
  if (!invoice) throw new ApiError(404, "not_found", "Invoice not found");
  await prisma.followUp.updateMany({
    where: { invoiceId, status: "PENDING", kind: { in: ["INVOICE_D3", "INVOICE_D7"] } },
    data: { status: "CANCELLED" },
  });
  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      paidVia: opts?.paidVia || "manual",
      ...(opts?.stripePaymentIntentId ? { stripePaymentIntentId: opts.stripePaymentIntentId } : {}),
      amountDuePence: 0,
    },
    include: { lines: { orderBy: { sort: "asc" } } },
  });
  void scheduleReviewAsk(invoiceId).catch((e) =>
    console.warn("[review] schedule failed", e instanceof Error ? e.message : e)
  );
  return updated;
}

/** Create Stripe Checkout Pay Now URL for an invoice (Connect destination charge). */
export async function createInvoicePayLink(publicToken: string): Promise<{ url: string; stub: boolean }> {
  const invoice = await prisma.invoice.findUnique({
    where: { publicToken },
    include: { client: true },
  });
  if (!invoice || invoice.status === "VOID") throw new ApiError(404, "not_found", "Invoice not found");
  if (invoice.status === "PAID") throw new ApiError(400, "already_paid", "Invoice already paid");

  const amountDue = invoice.amountDuePence > 0 ? invoice.amountDuePence : invoice.totalPence;
  const connectId = invoice.client.stripeConnectAccountId;
  if (!connectId || !invoice.client.stripeConnectOnboarded) {
    throw new ApiError(400, "connect_required", "Tradie has not enabled online payments yet");
  }

  const base = appPublicUrl();
  const session = await createConnectPaymentCheckout({
    connectedAccountId: connectId,
    amountPence: amountDue,
    currency: invoice.currency,
    description: `Invoice ${invoice.reference || ""} — ${invoice.client.businessName}`,
    successUrl: `${base}/i/${invoice.publicToken}?paid=1`,
    cancelUrl: `${base}/i/${invoice.publicToken}?cancelled=1`,
    clientId: invoice.clientId,
    metadata: {
      type: "invoice",
      invoiceId: invoice.id,
      publicToken: invoice.publicToken,
    },
  });

  if (session.sessionId) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripeCheckoutSessionId: session.sessionId },
    });
  }

  return { url: session.url, stub: session.stub };
}
