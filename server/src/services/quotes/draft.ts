import { prisma } from "../../db.js";
import { extractJobLinesWithHaiku } from "./claudeExtract.js";
import { matchPriceBook, quoteLineInclude } from "./priceBook.js";
import { totalsFromLines, type LineInput } from "./money.js";
import { newPublicToken } from "./magicAuth.js";
import type { PriceUnit } from "@prisma/client";

export async function buildDraftQuoteFromTranscript(opts: {
  clientId: string;
  enquiryId?: string | null;
  voiceNoteId?: string | null;
  transcript: string;
}) {
  const book = await prisma.priceBookItem.findMany({
    where: { clientId: opts.clientId, active: true },
  });
  const extracted = await extractJobLinesWithHaiku(opts.transcript);

  const lines: LineInput[] = [];
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

  for (const el of extracted.lines) {
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

  const quote = await prisma.quote.create({
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
      lines: {
        create: lines.map((l, i) => ({
          sort: i,
          label: l.label,
          qty: l.qty,
          unit: l.unit,
          unitPricePence: l.unitPricePence,
          vatRate: l.vatRate,
          priceBookItemId: l.priceBookItemId || null,
          source: l.source || "MANUAL",
        })),
      },
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
