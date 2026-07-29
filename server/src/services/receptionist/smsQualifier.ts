import { prisma } from "../../db.js";
import { getClaudeApiKey, claudeConfigured } from "../../settings.js";
import { sendMessage, toE164UK } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";
import { createMagicLogin, appPublicUrl } from "../quotes/magicAuth.js";
import { distanceMilesBetween, normalizePostcode } from "../geo/postcode.js";
import { findClientByTwilioNumber } from "../twilio/findClientByNumber.js";
import {
  conversationSummaryText,
  heuristicTriageFromText,
  mergeModelTriage,
  type EnquiryTriageTag,
} from "./triage.js";

type ConvoTurn = { role: "assistant" | "user"; text: string; at: string };

type QualifyResult = {
  assistantReply: string | null;
  ready: boolean;
  spam: boolean;
  name?: string;
  message?: string;
  postcode?: string | null;
  triage: EnquiryTriageTag;
  summary: string;
};

export async function handleMissedCallInboundSms(opts: {
  from: string;
  to: string;
  body: string;
  messageSid?: string;
}): Promise<{ handled: boolean }> {
  const from = toE164UK(opts.from);
  const to = toE164UK(opts.to);

  const client = await findClientByTwilioNumber(opts.to);

  if (!client) return { handled: false };

  let missed = await prisma.missedCall.findFirst({
    where: {
      clientId: client.id,
      callerPhone: { contains: from.replace(/\D/g, "").slice(-10) },
      status: { in: ["PENDING", "QUALIFYING"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!missed) {
    missed = await prisma.missedCall.create({
      data: {
        clientId: client.id,
        callerPhone: from,
        status: "QUALIFYING",
        conversation: [],
      },
    });
    void import("../onboarding/onboarding.js")
      .then((m) => m.markOnboardingTestCallIfNeeded(client.id))
      .catch(() => undefined);
  }

  const convo = (Array.isArray(missed.conversation) ? missed.conversation : []) as ConvoTurn[];
  convo.push({ role: "user", text: opts.body.trim(), at: new Date().toISOString() });

  await logMessage({
    clientId: client.id,
    direction: "INBOUND",
    channel: "SMS",
    toAddr: to,
    fromAddr: from,
    body: opts.body,
    twilioSid: opts.messageSid,
    status: "received",
  });

  const result = await qualifyConversation({
    businessName: client.businessName,
    tradeTitle: client.tradeTitle || "tradesperson",
    conversation: convo,
  });

  if (result.assistantReply) {
    convo.push({ role: "assistant", text: result.assistantReply, at: new Date().toISOString() });
    await sendMessage({ to: from, channel: "SMS", body: result.assistantReply });
    await logMessage({
      clientId: client.id,
      direction: "OUTBOUND",
      channel: "SMS",
      toAddr: from,
      body: result.assistantReply,
    });
  }

  if (result.spam) {
    const summary = result.summary || conversationSummaryText(convo) || "Suspected spam / telesales";
    const enquiry = await prisma.enquiry.create({
      data: {
        clientId: client.id,
        name: result.name || "Caller",
        phone: from,
        message: result.message || summary,
        source: "missed_call",
        status: client.status === "ACTIVE" || client.status === "TRIAL" ? "ROUTED" : "HELD",
        pipeline: "INBOX",
        triage: "SPAM",
        summary,
        deliveredAt: new Date(),
        deliveryInfo: "Auto-tagged spam from missed-call SMS qualify",
      },
    });
    await prisma.missedCall.update({
      where: { id: missed.id },
      data: { status: "SPAM", enquiryId: enquiry.id, conversation: convo },
    });
    const { url } = await createMagicLogin(client.id);
    const deep = `${appPublicUrl()}/t/jobs/${enquiry.id}?from=inbox`;
    const notifySms = `Caught in Inbox (spam): ${from}. ${summary.slice(0, 120)}\n\nOpen: ${deep}\nLogin: ${url}`;
    await sendMessage({ to: client.destPhone, channel: client.destChannel, body: notifySms });
    await logMessage({
      clientId: client.id,
      enquiryId: enquiry.id,
      direction: "OUTBOUND",
      channel: "SYSTEM",
      toAddr: client.destPhone,
      body: `Caught in Inbox (spam): ${from}. ${summary.slice(0, 200)}`,
    });
    return { handled: true };
  }

  if (result.ready && result.name && result.message) {
    const jobPostcode = result.postcode ? normalizePostcode(result.postcode) : null;
    const distanceMiles =
      jobPostcode && client.postcode ? await distanceMilesBetween(client.postcode, jobPostcode) : null;

    const enquiry = await prisma.enquiry.create({
      data: {
        clientId: client.id,
        name: result.name,
        phone: from,
        message: result.message,
        postcode: jobPostcode,
        distanceMiles,
        source: "missed_call",
        status: client.status === "ACTIVE" || client.status === "TRIAL" ? "ROUTED" : "HELD",
        pipeline: "INBOX",
        triage: result.triage === "SPAM" ? "UNKNOWN" : result.triage,
        summary: result.summary || result.message.slice(0, 160),
        deliveredAt: new Date(),
      },
    });

    await prisma.missedCall.update({
      where: { id: missed.id },
      data: { status: "CONVERTED", enquiryId: enquiry.id, conversation: convo },
    });

    const { url } = await createMagicLogin(client.id);
    const deep = `${appPublicUrl()}/t/jobs/${enquiry.id}?from=inbox`;
    const distBit = distanceMiles != null ? ` · ~${distanceMiles} mi` : "";
    const notifySms = `New in Inbox: ${result.name}${jobPostcode ? ` (${jobPostcode}${distBit})` : ""}. ${result.summary || result.message.slice(0, 120)}\n\nOpen: ${deep}\nLogin: ${url}`;
    await sendMessage({ to: client.destPhone, channel: client.destChannel, body: notifySms });

    await logMessage({
      clientId: client.id,
      enquiryId: enquiry.id,
      direction: "OUTBOUND",
      channel: "SYSTEM",
      toAddr: client.destPhone,
      body: `New in Inbox: ${result.name}${jobPostcode ? ` (${jobPostcode}${distBit})` : ""}. ${(result.summary || result.message).slice(0, 200)}`,
    });

    return { handled: true };
  }

  await prisma.missedCall.update({
    where: { id: missed.id },
    data: { status: "QUALIFYING", conversation: convo },
  });
  return { handled: true };
}

async function qualifyConversation(opts: {
  businessName: string;
  tradeTitle: string;
  conversation: ConvoTurn[];
}): Promise<QualifyResult> {
  const fallback = heuristicQualify(opts.conversation);
  if (!claudeConfigured()) return fallback;

  const key = getClaudeApiKey();
  const transcript = opts.conversation.map((t) => `${t.role}: ${t.text}`).join("\n");
  const prompt = `You are a UK trade receptionist for ${opts.businessName} (${opts.tradeTitle}).
Qualify the caller via SMS. Goal: get job description, postcode, and a name if possible.
Filter obvious spam/telesales (PPI, life insurance, pensions, solar, marketing agencies, business listings, lead-gen).
If it looks like price-shopping only, triage as QUOTE_SHOPPER.
Return ONLY JSON:
{"assistantReply":"string or null if done","ready":boolean,"spam":boolean,"triage":"LIKELY_JOB|QUOTE_SHOPPER|SPAM|UNKNOWN","summary":"one-line summary","name":"string|null","message":"job summary|null","postcode":"string|null"}

Conversation so far:
${transcript}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((c) => c.type === "text")?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as {
      assistantReply?: string | null;
      ready?: boolean;
      spam?: boolean;
      triage?: string | null;
      summary?: string | null;
      name?: string | null;
      message?: string | null;
      postcode?: string | null;
    };
    const triage = mergeModelTriage({
      spam: parsed.spam,
      triage: parsed.triage,
      summary: parsed.summary,
      message: parsed.message,
      transcript: conversationSummaryText(opts.conversation),
    });
    return {
      assistantReply: parsed.assistantReply ?? null,
      ready: !!parsed.ready && !triage.spam,
      spam: triage.spam,
      name: parsed.name || undefined,
      message: parsed.message || undefined,
      postcode: parsed.postcode || null,
      triage: triage.triage,
      summary: triage.summary,
    };
  } catch {
    return fallback;
  }
}

function heuristicQualify(conversation: ConvoTurn[]): QualifyResult {
  const userTexts = conversation.filter((c) => c.role === "user").map((c) => c.text);
  const joined = userTexts.join(" ");
  const triage = heuristicTriageFromText(joined);
  if (triage.spam) {
    return {
      assistantReply: null,
      ready: false,
      spam: true,
      triage: "SPAM",
      summary: triage.summary,
      name: "Caller",
      message: triage.summary,
    };
  }

  const postcodeMatch = joined.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  const hasJobWords = joined.length > 25;
  const userCount = userTexts.length;

  if (userCount === 1 && !postcodeMatch) {
    return {
      assistantReply: "Thanks — what's the job and what's your postcode? (And your name if you don't mind.)",
      ready: false,
      spam: false,
      triage: "UNKNOWN",
      summary: triage.summary,
    };
  }

  if (hasJobWords && (postcodeMatch || userCount >= 2)) {
    return {
      assistantReply: "Got it — we'll get this to the team and they'll be in touch shortly.",
      ready: true,
      spam: false,
      name: "Caller",
      message: joined.slice(0, 500),
      postcode: postcodeMatch ? postcodeMatch[1].toUpperCase() : null,
      triage: triage.triage,
      summary: triage.summary,
    };
  }

  return {
    assistantReply: "Thanks — could you share a bit more about the work needed and your postcode?",
    ready: false,
    spam: false,
    triage: "UNKNOWN",
    summary: triage.summary,
  };
}
