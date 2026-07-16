import { prisma } from "../../db.js";
import { getClaudeApiKey, claudeConfigured } from "../../settings.js";
import { sendMessage, toE164UK } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";
import { createMagicLogin, appPublicUrl } from "../quotes/magicAuth.js";

type ConvoTurn = { role: "assistant" | "user"; text: string; at: string };

export async function handleMissedCallInboundSms(opts: {
  from: string;
  to: string;
  body: string;
  messageSid?: string;
}): Promise<{ handled: boolean }> {
  const from = toE164UK(opts.from);
  const to = toE164UK(opts.to);

  const client =
    (await prisma.client.findFirst({ where: { twilioNumber: { contains: to.replace(/\D/g, "").slice(-10) } } })) ||
    (await prisma.client.findFirst({ where: { twilioNumber: to } }));

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
  }

  const convo = (Array.isArray(missed.conversation) ? missed.conversation : []) as ConvoTurn[];
  convo.push({ role: "user", text: opts.body.trim(), at: new Date().toISOString() });

  await logMessage({
    clientId: client.id,
    direction: "INBOUND",
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
      toAddr: from,
      body: result.assistantReply,
    });
  }

  if (result.spam) {
    await prisma.missedCall.update({
      where: { id: missed.id },
      data: { status: "SPAM", conversation: convo },
    });
    return { handled: true };
  }

  if (result.ready && result.name && result.message) {
    const enquiry = await prisma.enquiry.create({
      data: {
        clientId: client.id,
        name: result.name,
        phone: from,
        message: result.message,
        postcode: result.postcode || null,
        source: "missed_call",
        status: client.status === "ACTIVE" || client.status === "TRIAL" ? "ROUTED" : "HELD",
        deliveredAt: new Date(),
      },
    });

    await prisma.missedCall.update({
      where: { id: missed.id },
      data: { status: "CONVERTED", enquiryId: enquiry.id, conversation: convo },
    });

    const { url } = await createMagicLogin(client.id);
    const deep = `${appPublicUrl()}/t/jobs/${enquiry.id}`;
    const notify = `New job from missed call: ${result.name}${result.postcode ? ` (${result.postcode})` : ""}. ${result.message.slice(0, 120)}\n\nOpen: ${deep}\nLogin: ${url}`;
    await sendMessage({ to: client.destPhone, channel: client.destChannel, body: notify });
    await logMessage({
      clientId: client.id,
      enquiryId: enquiry.id,
      direction: "OUTBOUND",
      toAddr: client.destPhone,
      body: notify,
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
}): Promise<{
  assistantReply: string | null;
  ready: boolean;
  spam: boolean;
  name?: string;
  message?: string;
  postcode?: string | null;
}> {
  const fallback = heuristicQualify(opts.conversation);
  if (!claudeConfigured()) return fallback;

  const key = getClaudeApiKey();
  const transcript = opts.conversation.map((t) => `${t.role}: ${t.text}`).join("\n");
  const prompt = `You are a UK trade receptionist for ${opts.businessName} (${opts.tradeTitle}).
Qualify the caller via SMS. Goal: get job description, postcode, and a name if possible.
Filter obvious spam/sales (PPI, solar cold calls, etc).
Return ONLY JSON:
{"assistantReply":"string or null if done","ready":boolean,"spam":boolean,"name":"string|null","message":"job summary|null","postcode":"string|null"}

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
      name?: string | null;
      message?: string | null;
      postcode?: string | null;
    };
    return {
      assistantReply: parsed.assistantReply ?? null,
      ready: !!parsed.ready,
      spam: !!parsed.spam,
      name: parsed.name || undefined,
      message: parsed.message || undefined,
      postcode: parsed.postcode || null,
    };
  } catch {
    return fallback;
  }
}

function heuristicQualify(conversation: ConvoTurn[]): {
  assistantReply: string | null;
  ready: boolean;
  spam: boolean;
  name?: string;
  message?: string;
  postcode?: string | null;
} {
  const userTexts = conversation.filter((c) => c.role === "user").map((c) => c.text);
  const joined = userTexts.join(" ");
  const spamRe = /\b(ppi|solar panel|guaranteed|investment opportunity|marketing agency)\b/i;
  if (spamRe.test(joined)) {
    return { assistantReply: null, ready: false, spam: true };
  }

  const postcodeMatch = joined.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  const hasJobWords = joined.length > 25;
  const userCount = userTexts.length;

  if (userCount === 1 && !postcodeMatch) {
    return {
      assistantReply: "Thanks — what's the job and what's your postcode? (And your name if you don't mind.)",
      ready: false,
      spam: false,
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
    };
  }

  return {
    assistantReply: "Thanks — could you share a bit more about the work needed and your postcode?",
    ready: false,
    spam: false,
  };
}
