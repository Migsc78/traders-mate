import { Router } from "express";
import { prisma } from "../db.js";
import { env } from "../env.js";

export const dashboardRouter = Router();

/** Rough UK COGS estimates (pence). Labelled as estimates in the UI — not metered billing. */
const COST = {
  smsOutPence: 4, // Twilio UK SMS outbound ~£0.04
  whatsappOutPence: 5,
  emailOutPence: 0,
  systemOutPence: 0,
  /** Inbound voice leg + recording per missed-call session */
  voiceSessionPence: 3,
  /** Polly/Google TTS greeting or prompt */
  ttsPence: 1,
  /** Whisper ~30s average */
  whisperPence: 1,
  /** Haiku extract / qualify turn */
  haikuPence: 2,
} as const;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return startOfUtcDay(d);
}

function startOfMonth(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function groupCount<T extends string>(rows: { status: T; _count: { _all: number } }[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

dashboardRouter.get("/", async (_req, res, next) => {
  try {
    const now = new Date();
    const since7 = daysAgo(7);
    const since30 = daysAgo(30);
    const monthStart = startOfMonth(now);
    const planPence = Math.max(0, Math.round(env.SAAS_PLAN_PRICE_PENCE));

    const [
      clientsByStatus,
      trialsEndingSoon,
      earlyAccessByStatus,
      earlyAccessSignedUp,
      enquiriesTotal,
      enquiries7,
      enquiries30,
      enquiriesByStatus30,
      missedByStatus,
      missedByStatus30,
      missedConverted30,
      quotesByStatus,
      quotesSent30,
      quotesAccepted30,
      invoicesByStatus,
      invoicesPaidAgg,
      invoicesPaidMonthAgg,
      invoicesOutstandingAgg,
      messagesOut30,
      messagesOutByChannel30,
      voiceNotes30,
      missedCalls30,
      leadsTotal,
      leadsHot,
      searchRuns30,
    ] = await Promise.all([
      prisma.client.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.client.count({
        where: {
          status: "TRIAL",
          trialEndsAt: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.earlyAccessRequest.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.earlyAccessRequest.count({ where: { inviteUsedAt: { not: null } } }),
      prisma.enquiry.count(),
      prisma.enquiry.count({ where: { createdAt: { gte: since7 } } }),
      prisma.enquiry.count({ where: { createdAt: { gte: since30 } } }),
      prisma.enquiry.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      prisma.missedCall.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.missedCall.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      prisma.missedCall.count({
        where: { createdAt: { gte: since30 }, status: "CONVERTED" },
      }),
      prisma.quote.groupBy({
        by: ["status"],
        where: { status: { not: "DELETED" } },
        _count: { _all: true },
      }),
      prisma.quote.count({
        where: { sentAt: { gte: since30 }, status: { not: "DELETED" } },
      }),
      prisma.quote.count({
        where: { decidedAt: { gte: since30 }, status: "ACCEPTED" },
      }),
      prisma.invoice.groupBy({
        by: ["status"],
        where: { status: { not: "VOID" } },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: "PAID" },
        _sum: { totalPence: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: "PAID", paidAt: { gte: monthStart } },
        _sum: { totalPence: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { status: { in: ["SENT", "OVERDUE"] } },
        _sum: { totalPence: true },
        _count: { _all: true },
      }),
      prisma.message.count({
        where: { direction: "OUTBOUND", createdAt: { gte: since30 } },
      }),
      prisma.message.groupBy({
        by: ["channel"],
        where: { direction: "OUTBOUND", createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      prisma.voiceNote.count({ where: { createdAt: { gte: since30 } } }),
      prisma.missedCall.count({ where: { createdAt: { gte: since30 } } }),
      prisma.lead.count(),
      prisma.lead.count({
        where: { outreachStatus: { in: ["INTERESTED", "DEMO_SENT", "CONTACTED"] } },
      }),
      prisma.searchRun.count({ where: { createdAt: { gte: since30 } } }),
    ]);

    const clientStatus = groupCount(clientsByStatus);
    const earlyAccess = groupCount(earlyAccessByStatus);
    const missedAll = groupCount(missedByStatus);
    const missed30 = groupCount(missedByStatus30);
    const quoteStatus = groupCount(quotesByStatus);
    const invoiceStatus = groupCount(invoicesByStatus);
    const enquiryStatus30 = groupCount(enquiriesByStatus30);

    const active = clientStatus.ACTIVE ?? 0;
    const trial = clientStatus.TRIAL ?? 0;
    const pastDue = clientStatus.PAST_DUE ?? 0;
    const suspended = clientStatus.SUSPENDED ?? 0;
    const cancelled = clientStatus.CANCELLED ?? 0;
    const payingLike = active + pastDue; // past-due still billable until cancelled

    const channelCounts: Record<string, number> = {};
    for (const row of messagesOutByChannel30) {
      channelCounts[row.channel] = row._count._all;
    }
    const smsOut = channelCounts.SMS ?? 0;
    const waOut = channelCounts.WHATSAPP ?? 0;
    const emailOut = channelCounts.EMAIL ?? 0;
    const systemOut = channelCounts.SYSTEM ?? 0;

    const messagingCostPence =
      smsOut * COST.smsOutPence +
      waOut * COST.whatsappOutPence +
      emailOut * COST.emailOutPence +
      systemOut * COST.systemOutPence;

    // Each missed-call session: voice + TTS; Whisper/Haiku when voicemail or AI qualify runs.
    // Voice notes (job quotes) also burn Whisper + Haiku.
    const voiceRescueCostPence =
      missedCalls30 * (COST.voiceSessionPence + COST.ttsPence) +
      missedCalls30 * (COST.whisperPence + COST.haikuPence) +
      voiceNotes30 * (COST.whisperPence + COST.haikuPence);

    const totalCost30Pence = messagingCostPence + voiceRescueCostPence;

    const missedTotal30 = Object.values(missed30).reduce((a, b) => a + b, 0);
    const conversionRate30 =
      missedTotal30 > 0 ? Math.round((missedConverted30 / missedTotal30) * 1000) / 10 : null;

    const mrrPence = active * planPence;
    const atRiskMrrPence = pastDue * planPence;
    const trialPipelinePence = trial * planPence;

    const paidTotalPence = invoicesPaidAgg._sum.totalPence ?? 0;
    const paidMonthPence = invoicesPaidMonthAgg._sum.totalPence ?? 0;
    const outstandingPence = invoicesOutstandingAgg._sum.totalPence ?? 0;

    res.json({
      generatedAt: now.toISOString(),
      period: {
        last7DaysFrom: since7.toISOString(),
        last30DaysFrom: since30.toISOString(),
        monthStart: monthStart.toISOString(),
      },
      kpis: {
        clients: {
          active,
          trial,
          pastDue,
          suspended,
          cancelled,
          total: active + trial + pastDue + suspended + cancelled,
          trialsEndingSoon7d: trialsEndingSoon,
        },
        earlyAccess: {
          pending: earlyAccess.PENDING ?? 0,
          approved: earlyAccess.APPROVED ?? 0,
          denied: earlyAccess.DENIED ?? 0,
          signedUp: earlyAccessSignedUp,
        },
        enquiries: {
          total: enquiriesTotal,
          last7Days: enquiries7,
          last30Days: enquiries30,
          routed30: enquiryStatus30.ROUTED ?? 0,
          held30: enquiryStatus30.HELD ?? 0,
          failed30: enquiryStatus30.FAILED ?? 0,
        },
        missedCalls: {
          total: Object.values(missedAll).reduce((a, b) => a + b, 0),
          pending: missedAll.PENDING ?? 0,
          qualifying: missedAll.QUALIFYING ?? 0,
          converted: missedAll.CONVERTED ?? 0,
          spam: missedAll.SPAM ?? 0,
          expired: missedAll.EXPIRED ?? 0,
          last30Days: missedTotal30,
          converted30: missedConverted30,
          conversionRate30,
        },
        quotes: {
          draft: quoteStatus.DRAFT ?? 0,
          sent: quoteStatus.SENT ?? 0,
          accepted: quoteStatus.ACCEPTED ?? 0,
          declined: quoteStatus.DECLINED ?? 0,
          expired: quoteStatus.EXPIRED ?? 0,
          sent30: quotesSent30,
          accepted30: quotesAccepted30,
        },
        invoices: {
          draft: invoiceStatus.DRAFT ?? 0,
          sent: invoiceStatus.SENT ?? 0,
          paid: invoiceStatus.PAID ?? 0,
          overdue: invoiceStatus.OVERDUE ?? 0,
        },
        pipeline: {
          leadsTotal,
          leadsInPlay: leadsHot,
          searchRuns30,
        },
      },
      billableRevenue: {
        currency: "GBP",
        planPricePence: planPence,
        /** Estimated monthly recurring from ACTIVE clients × plan price */
        saasMrrPence: mrrPence,
        saasAtRiskMrrPence: atRiskMrrPence,
        saasTrialPipelinePence: trialPipelinePence,
        payingClients: payingLike,
        activeClients: active,
        trialClients: trial,
        /** Job invoices paid by end customers (platform GMV, not SaaS) */
        jobInvoicesPaidTotalPence: paidTotalPence,
        jobInvoicesPaidTotalCount: invoicesPaidAgg._count._all,
        jobInvoicesPaidMonthPence: paidMonthPence,
        jobInvoicesPaidMonthCount: invoicesPaidMonthAgg._count._all,
        jobInvoicesOutstandingPence: outstandingPence,
        jobInvoicesOutstandingCount: invoicesOutstandingAgg._count._all,
        note: "SaaS MRR uses SAAS_PLAN_PRICE_PENCE × ACTIVE clients. Job invoice totals are tradie↔customer money tracked in the app.",
      },
      costings: {
        currency: "GBP",
        periodDays: 30,
        estimated: true,
        ratesPence: { ...COST },
        usage30: {
          smsOutbound: smsOut,
          whatsappOutbound: waOut,
          emailOutbound: emailOut,
          systemOutbound: systemOut,
          messagesOutboundTotal: messagesOut30,
          missedCalls: missedCalls30,
          voiceNotes: voiceNotes30,
        },
        messagingPence: messagingCostPence,
        voiceAndAiPence: voiceRescueCostPence,
        totalPence: totalCost30Pence,
        note: "Estimates from volume × UK list-rate approximations. Not live Twilio/Anthropic/OpenAI invoices.",
      },
    });
  } catch (err) {
    next(err);
  }
});
