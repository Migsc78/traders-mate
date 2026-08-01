import { prisma } from "../../db.js";
import { extractJobLinesWithHaiku } from "./claudeExtract.js";
import { mergeTemplateWithHeard } from "./templateMatch.js";
import { matchPriceBook, quoteLineInclude } from "./priceBook.js";
import { totalsFromLines, type LineInput } from "./money.js";
import { newPublicToken } from "./magicAuth.js";
import type { PriceUnit } from "@prisma/client";

export async function buildDraftQuoteFromTranscript(opts: {
  clientId: string;
  enquiryId?: string | null;
  voiceNoteId?: string | null;
  transcript: string;
  /** Fill this existing draft instead of creating one — see below. */
  intoQuoteId?: string | null;
}) {
  const book = await prisma.priceBookItem.findMany({
    where: { clientId: opts.clientId, active: true },
  });

  // Only templates the tradie has opted into for drafting. Name and description
  // are enough for the model to recognise the job; prices stay server-side so it
  // can't invent them.
  const templates = await prisma.quoteTemplate.findMany({
    where: { clientId: opts.clientId, active: true, useForAiDrafting: true },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  const extracted = await extractJobLinesWithHaiku(
    opts.transcript,
    templates.map((t) => ({ id: t.id, name: t.name, description: t.description, tags: t.tags }))
  );

  const matchedTemplate = extracted.templateId
    ? templates.find((t) => t.id === extracted.templateId)
    : undefined;

  /**
   * When a template matches, its lines are the scope of the job and carry the
   * tradie's own prices. Anything else heard in the notes still goes through the
   * price book below, so "boiler service plus a power flush" gets both.
   */
  const templateLines: LineInput[] = [];
  let heardForPriceBook = extracted.lines;
  if (matchedTemplate) {
    const merged = mergeTemplateWithHeard(
      {
        included: matchedTemplate.items.filter((i) => !i.isAddOn),
        addOns: matchedTemplate.items.filter((i) => i.isAddOn),
      },
      extracted.lines
    );
    for (const line of merged.lines) {
      templateLines.push({
        label: line.label,
        qty: line.qty,
        unit: line.unit as PriceUnit,
        unitPricePence: line.unitPricePence,
        vatRate: line.vatRate,
        source: "BOOK",
      });
    }
    heardForPriceBook = merged.extras;
    await prisma.quoteTemplate.update({
      where: { id: matchedTemplate.id },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    });
  }

  const lines: LineInput[] = [...templateLines];
  if (extracted.callout && !extracted.lines.some((l) => /call.?out/i.test(l.label) || l.skuHint === "CALL")) {
    const call = book.find((b) => b.isCallout) || matchPriceBook(book, { label: "Call-out", skuHint: "CALL" });
    if (call) {
      lines.push({
        label: call.label,
        qty: 1,
        unit: call.unit,
        unitPricePence: call.unitPricePence,
        vatRate: call.vatRate,
        priceBookItemId: call.id,
        source: "BOOK",
      });
    }
  }

  for (const el of heardForPriceBook) {
    const matched = matchPriceBook(book, { label: el.label, skuHint: el.skuHint, unit: el.unit });
    if (matched) {
      lines.push({
        label: matched.label,
        qty: el.qty,
        unit: matched.unit,
        unitPricePence: matched.unitPricePence,
        vatRate: matched.vatRate,
        priceBookItemId: matched.id,
        source: "VOICE",
      });
    } else {
      lines.push({
        label: el.label,
        qty: el.qty,
        unit: el.unit as PriceUnit,
        unitPricePence: 0, // tradie must set
        vatRate: 20,
        source: "VOICE",
      });
    }
  }

  if (lines.length === 0) {
    lines.push({
      label: "Labour",
      qty: 1,
      unit: "JOB",
      unitPricePence: 0,
      vatRate: 20,
      source: "MANUAL",
    });
  }

  const vatInclusive = true;
  const totals = totalsFromLines(lines, vatInclusive);
  const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const lineData = lines.map((l, i) => ({
    sort: i,
    label: l.label,
    qty: l.qty,
    unit: l.unit,
    unitPricePence: l.unitPricePence,
    vatRate: l.vatRate,
    priceBookItemId: l.priceBookItemId || null,
    source: l.source || "MANUAL",
  }));

  /**
   * When intoQuoteId is set we're filling a quote the phone already created and
   * navigated to — the tradie captured notes with no signal, and this is the
   * queued write catching up. Creating a second quote here would leave them with
   * a duplicate and an empty draft they're still looking at.
   */
  const quote = opts.intoQuoteId
    ? await prisma.$transaction(async (tx) => {
        await tx.quoteLine.deleteMany({ where: { quoteId: opts.intoQuoteId! } });
        return tx.quote.update({
          where: { id: opts.intoQuoteId! },
          data: {
            voiceNoteId: opts.voiceNoteId || null,
            vatInclusive,
            ...totals,
            customerNote: extracted.summary || null,
            assumptions: extracted.assumptions.length ? extracted.assumptions.join("\n") : null,
            lines: { create: lineData },
          },
          include: { lines: quoteLineInclude },
        });
      })
    : await prisma.quote.create({
        data: {
          clientId: opts.clientId,
          enquiryId: opts.enquiryId || null,
          voiceNoteId: opts.voiceNoteId || null,
          status: "DRAFT",
          vatInclusive,
          ...totals,
          publicToken: newPublicToken(),
          customerNote: extracted.summary || null,
          assumptions: extracted.assumptions.length ? extracted.assumptions.join("\n") : null,
          validUntil,
          lines: { create: lineData },
        },
        include: { lines: quoteLineInclude },
      });

  if (opts.voiceNoteId) {
    await prisma.voiceNote.update({
      where: { id: opts.voiceNoteId },
      data: { status: "READY", transcript: opts.transcript, rawExtract: extracted as object },
    });
  }

  return quote;
}

export async function recomputeQuoteTotals(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { lines: true },
  });
  if (!quote) return null;
  const totals = totalsFromLines(
    quote.lines.map((l) => ({
      label: l.label,
      qty: l.qty,
      unit: l.unit,
      unitPricePence: l.unitPricePence,
      vatRate: l.vatRate,
    })),
    quote.vatInclusive
  );
  return prisma.quote.update({
    where: { id: quoteId },
    data: totals,
    include: { lines: quoteLineInclude },
  });
}
