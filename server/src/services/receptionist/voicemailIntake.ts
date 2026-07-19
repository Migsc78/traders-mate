import { prisma } from "../../db.js";
import {
  getClaudeApiKey,
  claudeConfigured,
  openaiConfigured,
  fillTemplate,
  getMissedCallSmsText,
} from "../../settings.js";
import { sendMessage, toE164UK } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";
import { createMagicLogin, appPublicUrl } from "../quotes/magicAuth.js";
import { distanceMilesBetween, normalizePostcode } from "../geo/postcode.js";
import { downloadTwilioRecording } from "../twilio/numbers.js";
import { transcribeWithWhisper } from "../quotes/whisper.js";

type Extracted = {
  name: string;
  message: string;
  postcode: string | null;
  spam: boolean;
};

type ConvoTurn = { role: string; text: string; at: string; source?: string };

async function fail(
  missedCallId: string,
  prevConversation: unknown,
  reason: string
): Promise<{ ok: false; reason: string }> {
  const convo = (Array.isArray(prevConversation) ? prevConversation : []) as ConvoTurn[];
  convo.push({
    role: "assistant",
    text: `[system] voicemail_failed=${reason}`,
    at: new Date().toISOString(),
  });
  await prisma.missedCall.update({
    where: { id: missedCallId },
    data: { conversation: convo },
  });
  return { ok: false, reason };
}

/**
 * Process a Twilio voicemail recording into an enquiry + tradie notify.
 * Returns whether a job was created; on failure caller should fall back to SMS qualify.
 */
export async function processVoicemailRecording(opts: {
  missedCallId: string;
  recordingUrl: string;
  recordingDurationSec?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const missed = await prisma.missedCall.findUnique({
    where: { id: opts.missedCallId },
    include: {
      client: {
        select: {
          id: true,
          businessName: true,
          tradeTitle: true,
          postcode: true,
          destPhone: true,
          destChannel: true,
          status: true,
        },
      },
    },
  });
  if (!missed) return { ok: false, reason: "missed_call_not_found" };
  if (missed.status === "CONVERTED" || missed.status === "SPAM") {
    return { ok: true, reason: "already_handled" };
  }

  const duration = opts.recordingDurationSec ?? 0;
  if (!opts.recordingUrl) {
    return await fail(missed.id, missed.conversation, "recording_missing");
  }
  // Allow very short clips — prospects often hang up quickly after the beep.
  if (Number.isFinite(duration) && duration > 0 && duration < 1) {
    return await fail(missed.id, missed.conversation, "recording_too_short");
  }

  if (!openaiConfigured()) {
    return await fail(missed.id, missed.conversation, "whisper_not_configured");
  }

  let transcript: string;
  try {
    const { buffer, contentType } = await downloadTwilioRecording(opts.recordingUrl);
    const filename = contentType.includes("mpeg") || contentType.includes("mp3") ? "voicemail.mp3" : "voicemail.wav";
    transcript = await transcribeWithWhisper(buffer, filename, contentType);
  } catch (e) {
    console.error("[voicemail] transcribe failed", e);
    const detail = e instanceof Error ? e.message : "transcribe_failed";
    return await fail(missed.id, missed.conversation, `transcribe_failed:${detail.slice(0, 120)}`);
  }

  const extracted = await extractJobFromTranscript({
    businessName: missed.client.businessName,
    tradeTitle: missed.client.tradeTitle || "tradesperson",
    transcript,
  });

  const convo = [
    {
      role: "user" as const,
      text: transcript,
      at: new Date().toISOString(),
      source: "voicemail",
    },
  ];

  if (extracted.spam) {
    await prisma.missedCall.update({
      where: { id: missed.id },
      data: { status: "SPAM", conversation: convo },
    });
    return { ok: true, reason: "spam" };
  }

  const jobPostcode = extracted.postcode ? normalizePostcode(extracted.postcode) : null;
  const distanceMiles =
    jobPostcode && missed.client.postcode
      ? await distanceMilesBetween(missed.client.postcode, jobPostcode)
      : null;

  const enquiry = await prisma.enquiry.create({
    data: {
      clientId: missed.client.id,
      name: extracted.name || "Caller",
      phone: missed.callerPhone,
      message: extracted.message || transcript.slice(0, 500),
      postcode: jobPostcode,
      distanceMiles,
      source: "missed_call_voicemail",
      status: missed.client.status === "ACTIVE" || missed.client.status === "TRIAL" ? "ROUTED" : "HELD",
      deliveredAt: new Date(),
    },
  });

  await prisma.missedCall.update({
    where: { id: missed.id },
    data: { status: "CONVERTED", enquiryId: enquiry.id, conversation: convo },
  });

  const { url } = await createMagicLogin(missed.client.id);
  const deep = `${appPublicUrl()}/t/jobs/${enquiry.id}`;
  const distBit = distanceMiles != null ? ` · ~${distanceMiles} mi` : "";
  const msg = extracted.message || transcript;
  const notifySms = `New job from voicemail: ${extracted.name || "Caller"}${jobPostcode ? ` (${jobPostcode}${distBit})` : ""}. ${msg.slice(0, 120)}\n\nOpen: ${deep}\nLogin: ${url}`;
  await sendMessage({ to: missed.client.destPhone, channel: missed.client.destChannel, body: notifySms });
  await logMessage({
    clientId: missed.client.id,
    enquiryId: enquiry.id,
    direction: "OUTBOUND",
    channel: "SYSTEM",
    toAddr: missed.client.destPhone,
    body: `New job from voicemail: ${extracted.name || "Caller"}${jobPostcode ? ` (${jobPostcode}${distBit})` : ""}. ${msg.slice(0, 200)}`,
  });

  // Short ack to caller (no Q&A loop)
  const caller = toE164UK(missed.callerPhone);
  if (caller) {
    const ack = `Thanks — we've got your message for ${missed.client.businessName} and they'll be in touch shortly.`;
    await sendMessage({ to: caller, channel: "SMS", body: ack });
    await logMessage({
      clientId: missed.client.id,
      enquiryId: enquiry.id,
      direction: "OUTBOUND",
      channel: "SMS",
      toAddr: caller,
      body: ack,
    });
  }

  return { ok: true };
}

/** Fall back to SMS qualify when voicemail fails or is empty. */
export async function fallbackMissedCallToSms(opts: {
  missedCallId: string;
}): Promise<void> {
  const missed = await prisma.missedCall.findUnique({
    where: { id: opts.missedCallId },
    include: {
      client: {
        select: {
          id: true,
          businessName: true,
          destPhone: true,
          destChannel: true,
        },
      },
    },
  });
  if (!missed || missed.status === "CONVERTED" || missed.status === "SPAM") return;

  const from = toE164UK(missed.callerPhone);
  if (!from) return;

  const vars = { businessName: missed.client.businessName };
  const smsBody = fillTemplate(getMissedCallSmsText(), vars);
  await sendMessage({ to: from, channel: "SMS", body: smsBody });
  await logMessage({
    clientId: missed.client.id,
    direction: "OUTBOUND",
    toAddr: from,
    body: smsBody,
  });

  const tradiePing = `Missed call from ${from} — voicemail failed, we've texted them for details.`;
  await sendMessage({ to: missed.client.destPhone, channel: missed.client.destChannel, body: tradiePing });
  await logMessage({
    clientId: missed.client.id,
    direction: "OUTBOUND",
    toAddr: missed.client.destPhone,
    body: tradiePing,
  });

  await prisma.missedCall.update({
    where: { id: missed.id },
    data: { status: "PENDING" },
  });
}

async function extractJobFromTranscript(opts: {
  businessName: string;
  tradeTitle: string;
  transcript: string;
}): Promise<Extracted> {
  const fallback = heuristicExtract(opts.transcript);
  if (!claudeConfigured()) return fallback;

  const key = getClaudeApiKey();
  const prompt = `You are a UK trade receptionist for ${opts.businessName} (${opts.tradeTitle}).
Extract a job enquiry from this caller voicemail transcript.
Filter obvious spam/sales (PPI, solar cold calls, etc).
Return ONLY JSON:
{"name":"string or Caller","message":"short job summary","postcode":"UK postcode or null","spam":boolean}

Transcript:
${opts.transcript}`;

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
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((c) => c.type === "text")?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as {
      name?: string | null;
      message?: string | null;
      postcode?: string | null;
      spam?: boolean;
    };
    return {
      name: (parsed.name || "Caller").trim() || "Caller",
      message: (parsed.message || opts.transcript).trim().slice(0, 500),
      postcode: parsed.postcode || null,
      spam: !!parsed.spam,
    };
  } catch {
    return fallback;
  }
}

function heuristicExtract(transcript: string): Extracted {
  const spamRe = /\b(ppi|solar panel|guaranteed|investment opportunity|marketing agency)\b/i;
  if (spamRe.test(transcript)) {
    return { name: "Caller", message: transcript.slice(0, 500), postcode: null, spam: true };
  }
  const postcodeMatch = transcript.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  return {
    name: "Caller",
    message: transcript.trim().slice(0, 500) || "Voicemail (no transcript)",
    postcode: postcodeMatch ? postcodeMatch[1].toUpperCase() : null,
    spam: false,
  };
}
