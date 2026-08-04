import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/error.js";
import { newPublicToken } from "../quotes/magicAuth.js";
import { totalsFromLines, type LineInput } from "../quotes/money.js";
import { appendJobEvent } from "./events.js";
import { netOf } from "./costs.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Build a draft invoice from a completed job.
 *
 * Two shapes of job end up here and both have to work:
 *
 *   - Quoted work bills the accepted baseline plus anything agreed on top. The
 *     quote's own lines are used verbatim, because that is what the customer
 *     said yes to and re-deriving them from cost records would quietly change
 *     the wording on the document.
 *   - A call-out has no quote at all, so the bill is the billable cost lines.
 *     This is the path the "no quote on this job" message was standing in for.
 *
 * Everything is normalised to net lines with VAT added, so a VAT-inclusive quote
 * and ex-VAT cost lines can sit on one document without one of them being 20%
 * wrong. Totals still come out identical to the quote the customer accepted.
 */
export async function createInvoiceFromJob(clientId: string, jobId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, clientId },
    include: {
      client: true,
      quote: { include: { lines: { orderBy: { sort: "asc" } } } },
      costs: { orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
      customer: true,
      enquiry: true,
      property: { select: { billToCustomerId: true } },
    },
  });
  if (!job) throw new ApiError(404, "not_found", "Job not found");

  const existing = await prisma.invoice.findFirst({
    where: { clientId, jobId: job.id, status: { not: "VOID" } },
    include: { lines: { orderBy: { sort: "asc" } } },
  });
  // Replaying a queued tap must not raise a second bill for the same work.
  if (existing) return existing;

  const lines: LineInput[] = [];
  const costIdsBilled: string[] = [];

  if (job.quote) {
    for (const l of job.quote.lines) {
      lines.push({
        label: l.label,
        qty: l.qty,
        unit: l.unit,
        unitPricePence: netOf(l.unitPricePence, l.vatRate, job.quote.vatInclusive),
        vatRate: l.vatRate,
      });
    }
    // Only the extras: the quote's own work is already on the document above.
    for (const c of job.costs) {
      if (!c.billable || !c.isExtra) continue;
      lines.push({
        label: c.label,
        qty: c.qty,
        unit: c.unit,
        unitPricePence: c.sellPricePence,
        vatRate: c.vatRate,
      });
      costIdsBilled.push(c.id);
    }
  } else {
    for (const c of job.costs) {
      if (!c.billable) continue;
      lines.push({
        label: c.label,
        qty: c.qty,
        unit: c.unit,
        unitPricePence: c.sellPricePence,
        vatRate: c.vatRate,
      });
      costIdsBilled.push(c.id);
    }
  }

  if (!lines.length) {
    throw new ApiError(
      400,
      "nothing_to_bill",
      "Nothing to invoice yet — add what you're charging on the Costs tab."
    );
  }

  const totals = totalsFromLines(lines, false);
  const depositApplied = job.depositPaidPence;
  const amountDue = Math.max(0, totals.totalPence - depositApplied);

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        clientId,
        jobId: job.id,
        quoteId: job.quoteId,
        enquiryId: job.enquiryId,
        // Bill the managing agent where the property says so, not the tenant.
        customerId: job.property?.billToCustomerId || job.customerId,
        status: "DRAFT",
        publicToken: newPublicToken(),
        customerName: job.customer?.name || job.enquiry?.name || null,
        customerPhone: job.enquiry?.phone || null,
        vatInclusive: false,
        subtotalPence: totals.subtotalPence,
        vatPence: totals.vatPence,
        totalPence: totals.totalPence,
        depositAppliedPence: depositApplied,
        amountDuePence: amountDue,
        dueDate: new Date(Date.now() + 7 * DAY_MS),
        reference: `INV-${Date.now().toString(36).toUpperCase()}`,
        bankName: job.client.bankName,
        bankSortCode: job.client.bankSortCode,
        bankAccountName: job.client.bankAccountName,
        bankAccountNumber: job.client.bankAccountNumber,
        customerNote: job.quote?.customerNote || null,
        lines: {
          create: lines.map((l, i) => ({
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

    // Stamped so a billed line can't be quietly edited afterwards — the document
    // the customer holds and the record here have to agree.
    if (costIdsBilled.length) {
      await tx.jobCost.updateMany({
        where: { id: { in: costIdsBilled } },
        data: { invoicedAt: new Date() },
      });
    }

    await appendJobEvent(tx, {
      clientId,
      jobId: job.id,
      type: "invoice.created",
      summary: `Draft invoice ${created.reference} for ${(created.totalPence / 100).toFixed(2)}`,
      payload: { invoiceId: created.id, depositAppliedPence: depositApplied },
    });

    return created;
  });

  return invoice;
}

/**
 * A preview of what the invoice would say, without creating one.
 *
 * The tradie sees the deposit come off before committing, which is the moment
 * "the customer already paid £500" either is or isn't reflected.
 */
export async function previewJobInvoice(clientId: string, jobId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, clientId },
    include: {
      quote: { include: { lines: { orderBy: { sort: "asc" } } } },
      costs: { orderBy: [{ sort: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!job) throw new ApiError(404, "not_found", "Job not found");

  const lines: { label: string; qty: number; unit: string; netPence: number; vatRate: number; extra: boolean }[] = [];

  if (job.quote) {
    for (const l of job.quote.lines) {
      lines.push({
        label: l.label,
        qty: l.qty,
        unit: l.unit,
        netPence: netOf(l.unitPricePence, l.vatRate, job.quote.vatInclusive),
        vatRate: l.vatRate,
        extra: false,
      });
    }
    for (const c of job.costs) {
      if (!c.billable || !c.isExtra) continue;
      lines.push({ label: c.label, qty: c.qty, unit: c.unit, netPence: c.sellPricePence, vatRate: c.vatRate, extra: true });
    }
  } else {
    for (const c of job.costs) {
      if (!c.billable) continue;
      lines.push({ label: c.label, qty: c.qty, unit: c.unit, netPence: c.sellPricePence, vatRate: c.vatRate, extra: c.isExtra });
    }
  }

  const totals = totalsFromLines(
    lines.map((l) => ({ label: l.label, qty: l.qty, unit: l.unit as never, unitPricePence: l.netPence, vatRate: l.vatRate })),
    false
  );

  const existing = await prisma.invoice.findFirst({
    where: { clientId, jobId: job.id, status: { not: "VOID" } },
    select: { id: true, reference: true, status: true },
  });

  return {
    lines,
    ...totals,
    depositAppliedPence: job.depositPaidPence,
    amountDuePence: Math.max(0, totals.totalPence - job.depositPaidPence),
    existingInvoice: existing,
  };
}
