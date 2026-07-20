import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { ApiError } from "../middleware/error.js";
import { appPublicUrl } from "../services/quotes/magicAuth.js";

export const dashboardRouter = Router();

export const DASHBOARD_KPI_KEYS = [
  "active-clients",
  "early-access",
  "enquiries",
  "missed-calls",
  "quotes",
  "invoices-overdue",
  "trials-ending",
  "leads-in-play",
  "saas-mrr",
  "at-risk-mrr",
  "trial-pipeline",
  "invoices-paid-month",
  "invoices-paid-all",
  "invoices-outstanding",
  "costings",
  "costings-messaging",
  "costings-voice",
] as const;

export type DashboardKpiKey = (typeof DASHBOARD_KPI_KEYS)[number];

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

const clientSelect = {
  id: true,
  businessName: true,
  status: true,
  destPhone: true,
  destChannel: true,
  trialEndsAt: true,
  town: true,
  tradeTitle: true,
  createdAt: true,
} as const;

function clientWhereForKpi(kpi: DashboardKpiKey) {
  const now = new Date();
  switch (kpi) {
    case "active-clients":
    case "saas-mrr":
      return { status: "ACTIVE" as const };
    case "at-risk-mrr":
      return { status: "PAST_DUE" as const };
    case "trial-pipeline":
      return { status: "TRIAL" as const };
    case "trials-ending":
      return {
        status: "TRIAL" as const,
        trialEndsAt: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
      };
    default:
      return null;
  }
}

dashboardRouter.get("/details", async (req, res, next) => {
  try {
    const kpiRaw = String(req.query.kpi || "").trim();
    if (!(DASHBOARD_KPI_KEYS as readonly string[]).includes(kpiRaw)) {
      throw new ApiError(400, "bad_request", `Unknown kpi. Use one of: ${DASHBOARD_KPI_KEYS.join(", ")}`);
    }
    const kpi = kpiRaw as DashboardKpiKey;
    const since7 = daysAgo(7);
    const since30 = daysAgo(30);
    const monthStart = startOfMonth();
    const base = appPublicUrl();

    const clientFilter = clientWhereForKpi(kpi);
    if (clientFilter) {
      const rows = await prisma.client.findMany({
        where: clientFilter,
        select: clientSelect,
        orderBy: [{ trialEndsAt: "asc" }, { businessName: "asc" }],
        take: 200,
      });
      const titles: Record<string, { title: string; description: string }> = {
        "active-clients": {
          title: "Active clients",
          description: "Paying clients on ACTIVE — open a client, suspend, or send a billing link.",
        },
        "saas-mrr": {
          title: "SaaS MRR — active clients",
          description: "These ACTIVE clients drive estimated MRR. Send a billing link or open their account.",
        },
        "at-risk-mrr": {
          title: "At-risk MRR — past due",
          description: "Past-due clients still count toward risk until cancelled. Chase payment or suspend.",
        },
        "trial-pipeline": {
          title: "Trial pipeline",
          description: "Clients currently on trial. Convert with a billing link or open their account.",
        },
        "trials-ending": {
          title: "Trials ending within 7 days",
          description: "Follow up before they drop off — send a billing link or open the client.",
        },
      };
      const meta = titles[kpi]!;
      return res.json({
        kpi,
        kind: "clients" as const,
        title: meta.title,
        description: meta.description,
        total: rows.length,
        rows: rows.map((r) => ({
          ...r,
          trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }

    if (kpi === "early-access") {
      const rows = await prisma.earlyAccessRequest.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return res.json({
        kpi,
        kind: "early-access" as const,
        title: "Early access queue",
        description: "Pending requests — approve to send a one-time signup invite, or deny.",
        total: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          email: r.email,
          phone: r.phone,
          occupation: r.occupation,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }

    if (kpi === "enquiries") {
      const rows = await prisma.enquiry.findMany({
        where: { createdAt: { gte: since7 } },
        include: { client: { select: { id: true, businessName: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return res.json({
        kpi,
        kind: "enquiries" as const,
        title: "Enquiries (last 7 days)",
        description: "Jobs that came in this week. Open the client to review or follow up.",
        total: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          message: r.message,
          postcode: r.postcode,
          source: r.source,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
          client: r.client,
        })),
      });
    }

    if (kpi === "missed-calls" || kpi === "costings-voice") {
      const rows = await prisma.missedCall.findMany({
        where: { createdAt: { gte: since30 } },
        include: { client: { select: { id: true, businessName: true, status: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return res.json({
        kpi,
        kind: "missed-calls" as const,
        title: kpi === "costings-voice" ? "Voice rescue sessions (30d)" : "Missed-call rescue (30d)",
        description:
          "Mark spam/expired, or open the client. Converted rows already have a linked enquiry.",
        total: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          callerPhone: r.callerPhone,
          status: r.status,
          enquiryId: r.enquiryId,
          callSid: r.callSid,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          client: r.client,
        })),
      });
    }

    if (kpi === "quotes") {
      const rows = await prisma.quote.findMany({
        where: { sentAt: { gte: since30 }, status: { not: "DELETED" } },
        include: {
          client: { select: { id: true, businessName: true, status: true } },
          enquiry: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { sentAt: "desc" },
        take: 200,
      });
      return res.json({
        kpi,
        kind: "quotes" as const,
        title: "Quotes sent (30d)",
        description: "Open the client or copy the customer quote link.",
        total: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          status: r.status,
          totalPence: r.totalPence,
          sentAt: r.sentAt?.toISOString() ?? null,
          decidedAt: r.decidedAt?.toISOString() ?? null,
          customerName: r.enquiry?.name ?? null,
          customerPhone: r.enquiry?.phone ?? null,
          publicUrl: `${base}/q/${r.publicToken}`,
          client: r.client,
        })),
      });
    }

    if (
      kpi === "invoices-overdue" ||
      kpi === "invoices-paid-month" ||
      kpi === "invoices-paid-all" ||
      kpi === "invoices-outstanding"
    ) {
      const where =
        kpi === "invoices-overdue"
          ? { status: "OVERDUE" as const }
          : kpi === "invoices-paid-month"
            ? { status: "PAID" as const, paidAt: { gte: monthStart } }
            : kpi === "invoices-paid-all"
              ? { status: "PAID" as const }
              : { status: { in: ["SENT" as const, "OVERDUE" as const] } };
      const titles = {
        "invoices-overdue": {
          title: "Overdue invoices",
          description: "Mark paid when the tradie confirms bank transfer, or open the client.",
        },
        "invoices-paid-month": {
          title: "Job invoices paid this month",
          description: "Tradie↔customer GMV recorded as paid this calendar month.",
        },
        "invoices-paid-all": {
          title: "Job invoices paid (all time)",
          description: "All paid job invoices tracked in the app.",
        },
        "invoices-outstanding": {
          title: "Outstanding invoices",
          description: "Sent or overdue — mark paid, flag overdue, or open the client.",
        },
      } as const;
      const rows = await prisma.invoice.findMany({
        where,
        include: { client: { select: { id: true, businessName: true, status: true } } },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 200,
      });
      const meta = titles[kpi];
      return res.json({
        kpi,
        kind: "invoices" as const,
        title: meta.title,
        description: meta.description,
        total: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          status: r.status,
          customerName: r.customerName,
          customerPhone: r.customerPhone,
          totalPence: r.totalPence,
          dueDate: r.dueDate?.toISOString() ?? null,
          sentAt: r.sentAt?.toISOString() ?? null,
          paidAt: r.paidAt?.toISOString() ?? null,
          publicUrl: `${base}/i/${r.publicToken}`,
          client: r.client,
        })),
      });
    }

    if (kpi === "leads-in-play") {
      const rows = await prisma.lead.findMany({
        where: { outreachStatus: { in: ["INTERESTED", "DEMO_SENT", "CONTACTED"] } },
        select: {
          id: true,
          displayName: true,
          occupation: true,
          town: true,
          phone: true,
          outreachStatus: true,
          qualified: true,
          createdAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      });
      return res.json({
        kpi,
        kind: "leads" as const,
        title: "Leads in play",
        description: "Contacted / interested / demo-sent — open a lead to continue outreach.",
        total: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          businessName: r.displayName,
          occupation: r.occupation,
          town: r.town,
          phone: r.phone,
          outreachStatus: r.outreachStatus,
          qualified: r.qualified,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }

    if (kpi === "costings" || kpi === "costings-messaging") {
      const messages = await prisma.message.findMany({
        where: {
          direction: "OUTBOUND",
          createdAt: { gte: since30 },
          channel: { in: ["SMS", "WHATSAPP"] },
        },
        include: { client: { select: { id: true, businessName: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return res.json({
        kpi,
        kind: "messages" as const,
        title: kpi === "costings" ? "Costings — recent outbound messages (30d)" : "Messaging usage (30d)",
        description:
          "Recent SMS/WhatsApp from the app. For live Twilio invoices open the Twilio page.",
        total: messages.length,
        rows: messages.map((m) => ({
          id: m.id,
          channel: m.channel,
          toAddr: m.toAddr,
          status: m.status,
          twilioSid: m.twilioSid,
          bodyPreview: m.body.slice(0, 120),
          createdAt: m.createdAt.toISOString(),
          client: m.client,
        })),
        links: [{ label: "Open Twilio page", href: "/admin/twilio" }],
      });
    }

    throw new ApiError(400, "bad_request", "Unhandled kpi");
  } catch (err) {
    next(err);
  }
});

dashboardRouter.patch("/missed-calls/:id", async (req, res, next) => {
  try {
    const body = z
      .object({ status: z.enum(["PENDING", "QUALIFYING", "CONVERTED", "SPAM", "EXPIRED"]) })
      .parse(req.body ?? {});
    const row = await prisma.missedCall.findUnique({ where: { id: req.params.id } });
    if (!row) throw new ApiError(404, "not_found", "Missed call not found");
    const updated = await prisma.missedCall.update({
      where: { id: row.id },
      data: { status: body.status },
      include: { client: { select: { id: true, businessName: true, status: true } } },
    });
    res.json({
      ok: true,
      row: {
        id: updated.id,
        callerPhone: updated.callerPhone,
        status: updated.status,
        enquiryId: updated.enquiryId,
        callSid: updated.callSid,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        client: updated.client,
      },
    });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.patch("/invoices/:id", async (req, res, next) => {
  try {
    const body = z.object({ status: z.enum(["SENT", "PAID", "OVERDUE", "VOID"]) }).parse(req.body ?? {});
    const row = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!row) throw new ApiError(404, "not_found", "Invoice not found");
    const data: {
      status: "SENT" | "PAID" | "OVERDUE" | "VOID";
      paidAt?: Date | null;
      paidReportedAt?: Date | null;
    } = { status: body.status };
    if (body.status === "PAID") {
      data.paidAt = row.paidAt ?? new Date();
      data.paidReportedAt = new Date();
    } else if (row.status === "PAID") {
      data.paidAt = null;
      data.paidReportedAt = null;
    }
    const updated = await prisma.invoice.update({
      where: { id: row.id },
      data,
      include: { client: { select: { id: true, businessName: true, status: true } } },
    });
    const base = appPublicUrl();
    res.json({
      ok: true,
      row: {
        id: updated.id,
        status: updated.status,
        customerName: updated.customerName,
        customerPhone: updated.customerPhone,
        totalPence: updated.totalPence,
        dueDate: updated.dueDate?.toISOString() ?? null,
        sentAt: updated.sentAt?.toISOString() ?? null,
        paidAt: updated.paidAt?.toISOString() ?? null,
        publicUrl: `${base}/i/${updated.publicToken}`,
        client: updated.client,
      },
    });
  } catch (err) {
    next(err);
  }
});
