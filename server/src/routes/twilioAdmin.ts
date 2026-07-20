import { Router } from "express";
import { prisma } from "../db.js";
import {
  getTwilioAccountSid,
  getTwilioSmsFrom,
  getTwilioWhatsappFrom,
  twilioConfigured,
} from "../settings.js";
import {
  digitsOnly,
  fetchAccountBalance,
  fetchAccountInfo,
  fetchUsageRecords,
  listIncomingNumbers,
  smsWebhookUrl,
  voiceWebhookUrl,
  type TwilioUsageRecord,
} from "../services/twilio/numbers.js";
import { toE164UK } from "../services/messaging/sender.js";

export const twilioAdminRouter = Router();

/** Categories operators usually care about for a messaging + inbound-voice product. */
const HIGHLIGHT_CATEGORIES = new Set([
  "totalprice",
  "sms",
  "sms-inbound",
  "sms-outbound",
  "sms-messages-carrierfees",
  "mms",
  "mms-inbound",
  "mms-outbound",
  "calls",
  "calls-inbound",
  "calls-outbound",
  "calls-inbound-local",
  "calls-inbound-mobile",
  "calls-inbound-tollfree",
  "recordings",
  "recordingstorage",
  "phonenumbers",
  "phonenumbers-local",
  "phonenumbers-mobile",
  "phonenumbers-tollfree",
  "pv-whatsapp",
  "channels",
  "carrierfees",
]);

function maskSid(sid: string): string {
  if (!sid || sid.length < 8) return sid || "";
  return `${sid.slice(0, 4)}…${sid.slice(-4)}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return startOfUtcDay(d);
}

function pickUsage(records: TwilioUsageRecord[]) {
  const highlights = records
    .filter((r) => HIGHLIGHT_CATEGORIES.has(r.category) || Number(r.price) !== 0)
    .sort((a, b) => Math.abs(Number(b.price)) - Math.abs(Number(a.price)));
  const total = records.find((r) => r.category === "totalprice");
  return {
    totalPrice: total?.price ?? null,
    priceUnit: total?.priceUnit ?? highlights[0]?.priceUnit ?? "USD",
    startDate: total?.startDate || highlights[0]?.startDate || null,
    endDate: total?.endDate || highlights[0]?.endDate || null,
    records: highlights.slice(0, 40),
  };
}

/** Rough UK COGS estimates (pence) when Twilio Usage API is unavailable. */
const EST = {
  smsOutPence: 4,
  whatsappOutPence: 5,
  voiceSessionPence: 3,
} as const;

twilioAdminRouter.get("/", async (_req, res, next) => {
  try {
    const configured = twilioConfigured();
    const expectedVoiceUrl = voiceWebhookUrl();
    const expectedSmsUrl = smsWebhookUrl();
    const since7 = daysAgo(7);
    const since30 = daysAgo(30);

    const clientsWithNumbers = await prisma.client.findMany({
      where: { twilioNumber: { not: null } },
      select: {
        id: true,
        businessName: true,
        status: true,
        twilioNumber: true,
        destPhone: true,
        destChannel: true,
        missedCallMode: true,
      },
      orderBy: { businessName: "asc" },
    });

    const [
      messagesByChannelDir30,
      messagesByChannelDir7,
      messagesFailed30,
      missed30,
      missedByStatus30,
      outboundWithSid30,
    ] = await Promise.all([
      prisma.message.groupBy({
        by: ["channel", "direction"],
        where: { createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      prisma.message.groupBy({
        by: ["channel", "direction"],
        where: { createdAt: { gte: since7 } },
        _count: { _all: true },
      }),
      prisma.message.count({
        where: {
          createdAt: { gte: since30 },
          OR: [{ status: { contains: "fail", mode: "insensitive" } }, { status: "undelivered" }, { status: "failed" }],
        },
      }),
      prisma.missedCall.count({ where: { createdAt: { gte: since30 } } }),
      prisma.missedCall.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      prisma.message.count({
        where: {
          direction: "OUTBOUND",
          createdAt: { gte: since30 },
          channel: { in: ["SMS", "WHATSAPP"] },
          twilioSid: { not: null },
        },
      }),
    ]);

    function packMessageGroups(
      rows: { channel: string; direction: string; _count: { _all: number } }[]
    ) {
      const out: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        const key = `${r.direction}_${r.channel}`;
        out[key] = r._count._all;
        total += r._count._all;
      }
      return { byKey: out, total };
    }

    const local30 = packMessageGroups(messagesByChannelDir30);
    const local7 = packMessageGroups(messagesByChannelDir7);
    const smsOut30 = local30.byKey.OUTBOUND_SMS ?? 0;
    const waOut30 = local30.byKey.OUTBOUND_WHATSAPP ?? 0;
    const estimatedCost30Pence =
      smsOut30 * EST.smsOutPence + waOut30 * EST.whatsappOutPence + missed30 * EST.voiceSessionPence;

    const missedStatus: Record<string, number> = {};
    for (const r of missedByStatus30) missedStatus[r.status] = r._count._all;

    let account: Awaited<ReturnType<typeof fetchAccountInfo>> = null;
    let balance: Awaited<ReturnType<typeof fetchAccountBalance>> = null;
    let numbers: Awaited<ReturnType<typeof listIncomingNumbers>> = [];
    let usageThisMonth = pickUsage([]);
    let usageLastMonth = pickUsage([]);
    let usageToday = pickUsage([]);
    let twilioError: string | null = null;

    if (configured) {
      try {
        const [acct, bal, nums, thisM, lastM, today] = await Promise.all([
          fetchAccountInfo(),
          fetchAccountBalance(),
          listIncomingNumbers(),
          fetchUsageRecords("ThisMonth"),
          fetchUsageRecords("LastMonth"),
          fetchUsageRecords("Today"),
        ]);
        account = acct;
        balance = bal;
        numbers = nums;
        usageThisMonth = pickUsage(thisM);
        usageLastMonth = pickUsage(lastM);
        usageToday = pickUsage(today);
      } catch (e) {
        twilioError = e instanceof Error ? e.message : String(e);
      }
    }

    const clientByDigits = new Map<string, (typeof clientsWithNumbers)[number]>();
    for (const c of clientsWithNumbers) {
      if (!c.twilioNumber) continue;
      try {
        clientByDigits.set(digitsOnly(toE164UK(c.twilioNumber)), c);
      } catch {
        clientByDigits.set(digitsOnly(c.twilioNumber), c);
      }
    }

    const numberRows = numbers.map((n) => {
      const digits = digitsOnly(n.phoneNumber);
      const client = clientByDigits.get(digits) ?? null;
      const voiceOk = (n.voiceUrl || "").replace(/\/$/, "") === expectedVoiceUrl.replace(/\/$/, "");
      const smsOk = (n.smsUrl || "").replace(/\/$/, "") === expectedSmsUrl.replace(/\/$/, "");
      return {
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        capabilities: n.capabilities,
        dateCreated: n.dateCreated,
        voiceUrl: n.voiceUrl,
        smsUrl: n.smsUrl,
        voiceOk,
        smsOk,
        webhooksOk: voiceOk && smsOk,
        assignedClient: client
          ? {
              id: client.id,
              businessName: client.businessName,
              status: client.status,
              missedCallMode: client.missedCallMode,
              destChannel: client.destChannel,
            }
          : null,
      };
    });

    const assignedDigits = new Set(numberRows.map((n) => digitsOnly(n.phoneNumber)));
    const unassignedOnTwilio = numberRows.filter((n) => !n.assignedClient);
    const clientsMissingOnTwilio = clientsWithNumbers.filter((c) => {
      if (!c.twilioNumber) return false;
      const d = digitsOnly(toE164UK(c.twilioNumber));
      return !assignedDigits.has(d);
    });

    const sid = getTwilioAccountSid();

    res.json({
      generatedAt: new Date().toISOString(),
      configured,
      twilioError,
      account: {
        sidHint: sid ? maskSid(sid) : null,
        friendlyName: account?.friendlyName ?? null,
        status: account?.status ?? null,
        type: account?.type ?? null,
        smsFrom: getTwilioSmsFrom() || null,
        whatsappFrom: getTwilioWhatsappFrom() || null,
        expectedVoiceUrl,
        expectedSmsUrl,
      },
      balance,
      numbers: {
        totalOnTwilio: numberRows.length,
        assignedToClients: numberRows.filter((n) => n.assignedClient).length,
        unassignedCount: unassignedOnTwilio.length,
        clientsWithNumberMissingOnTwilio: clientsMissingOnTwilio.length,
        rows: numberRows,
        clientsMissing: clientsMissingOnTwilio.map((c) => ({
          id: c.id,
          businessName: c.businessName,
          status: c.status,
          twilioNumber: c.twilioNumber,
          missedCallMode: c.missedCallMode,
        })),
      },
      usage: {
        today: usageToday,
        thisMonth: usageThisMonth,
        lastMonth: usageLastMonth,
      },
      local: {
        messages7d: local7,
        messages30d: local30,
        outboundWithTwilioSid30: outboundWithSid30,
        failedOrUndelivered30: messagesFailed30,
        missedCalls30: missed30,
        missedByStatus30: missedStatus,
        estimatedCost30: {
          currency: "GBP",
          totalPence: estimatedCost30Pence,
          note: "Local volume × rough UK rates — prefer Twilio Usage totals above when available.",
          breakdown: {
            smsOutbound: smsOut30,
            whatsappOutbound: waOut30,
            missedCallSessions: missed30,
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
});
