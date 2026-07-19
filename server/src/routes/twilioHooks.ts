import { Router } from "express";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { sendMessage, toE164UK } from "../services/messaging/sender.js";
import { logMessage } from "../services/messaging/log.js";
import { handleMissedCallInboundSms } from "../services/receptionist/smsQualifier.js";
import {
  processVoicemailRecording,
  fallbackMissedCallToSms,
} from "../services/receptionist/voicemailIntake.js";
import { findClientByTwilioNumber } from "../services/twilio/findClientByNumber.js";
import { requireTwilioSignature } from "../middleware/twilioSignature.js";
import { openaiConfigured } from "../settings.js";
import {
  fillTemplate,
  getMissedCallSayText,
  getMissedCallSayVoice,
  getMissedCallSmsText,
} from "../settings.js";

export const twilioHooksRouter = Router();
twilioHooksRouter.use(requireTwilioSignature);

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function recordingActionUrl(missedCallId: string): string {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return `${base}/api/twilio/voice/recording?missedCallId=${encodeURIComponent(missedCallId)}`;
}

const VOICEMAIL_PROMPT =
  "Please leave your name, what you need doing, and your postcode after the beep. When you're finished, hang up.";

async function handleMissedVoice(opts: {
  to: string;
  from: string;
  callSid: string;
  clientHint?: {
    id: string;
    businessName: string;
    destPhone: string;
    destChannel: "SMS" | "WHATSAPP" | "BOTH";
  };
}) {
  const from = toE164UK(opts.from);

  const client = opts.clientHint || (await findClientByTwilioNumber(opts.to));

  if (!client || !from) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">Sorry, this number is not configured.</Say><Hangup/></Response>`;
  }

  const row = await prisma.client.findUnique({
    where: { id: client.id },
    select: { greetingAudioUrl: true, missedCallMode: true },
  });
  const greetingUrl = row?.greetingAudioUrl?.trim() || null;
  const mode = row?.missedCallMode || "SMS_QUALIFY";
  // Honour Settings choice for the call flow. Whisper is only required when processing the recording
  // (missing key → SMS fallback after Record, not an instant text at call start).
  const useVoicemail = mode === "VOICEMAIL";
  if (useVoicemail && !openaiConfigured()) {
    console.warn("[twilio voice] VOICEMAIL mode but OpenAI/Whisper not configured — will Record then SMS-fallback if transcribe fails", {
      clientId: client.id,
    });
  }

  const missed = await prisma.missedCall.create({
    data: {
      clientId: client.id,
      callerPhone: from,
      status: "PENDING",
      callSid: opts.callSid || null,
      conversation: [],
    },
  });

  const vars = { businessName: client.businessName };
  const voice = getMissedCallSayVoice();

  if (useVoicemail) {
    const action = escXml(recordingActionUrl(missed.id));
    const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?><Response>'];
    if (greetingUrl) {
      parts.push(`<Play>${escXml(greetingUrl)}</Play>`);
    } else {
      parts.push(
        `<Say voice="${escXml(voice)}"><break strength="x-weak"/>Sorry we missed your call at ${escXml(client.businessName)}.</Say>`
      );
    }
    parts.push(`<Say voice="${escXml(voice)}">${escXml(VOICEMAIL_PROMPT)}</Say>`);
    parts.push(
      `<Record maxLength="60" playBeep="true" timeout="4" action="${action}" method="POST" />`
    );
    parts.push(
      `<Say voice="${escXml(voice)}">Sorry we didn't catch that. We'll text you instead.</Say>`
    );
    parts.push("<Hangup/></Response>");
    return parts.join("");
  }

  // SMS qualify path (default)
  const smsBody = fillTemplate(getMissedCallSmsText(), vars);
  await sendMessage({ to: from, channel: "SMS", body: smsBody });
  await logMessage({
    clientId: client.id,
    direction: "OUTBOUND",
    toAddr: from,
    body: smsBody,
  });

  const tradiePing = `Missed call from ${from} — we've texted them for details.`;
  await sendMessage({ to: client.destPhone, channel: client.destChannel, body: tradiePing });
  await logMessage({
    clientId: client.id,
    direction: "OUTBOUND",
    toAddr: client.destPhone,
    body: tradiePing,
  });

  if (greetingUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escXml(greetingUrl)}</Play><Hangup/></Response>`;
  }

  const say = fillTemplate(getMissedCallSayText(), vars);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${escXml(voice)}"><break strength="x-weak"/>${escXml(say)}</Say><Hangup/></Response>`;
}

twilioHooksRouter.post("/voice/missed", async (req, res) => {
  try {
    const xml = await handleMissedVoice({
      to: String(req.body.To || req.body.Called || ""),
      from: String(req.body.From || req.body.Caller || ""),
      callSid: String(req.body.CallSid || ""),
    });
    res.type("text/xml").send(xml);
  } catch (e) {
    console.error("[twilio voice]", e);
    res
      .type("text/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">Sorry, something went wrong.</Say><Hangup/></Response>`
      );
  }
});

twilioHooksRouter.post("/voice/missed/:routeKey", async (req, res) => {
  try {
    const client = await prisma.client.findUnique({ where: { routeKey: req.params.routeKey } });
    const xml = await handleMissedVoice({
      to: client?.twilioNumber || String(req.body.To || ""),
      from: String(req.body.From || req.body.Caller || ""),
      callSid: String(req.body.CallSid || ""),
      clientHint: client
        ? {
            id: client.id,
            businessName: client.businessName,
            destPhone: client.destPhone,
            destChannel: client.destChannel,
          }
        : undefined,
    });
    res.type("text/xml").send(xml);
  } catch (e) {
    console.error("[twilio voice]", e);
    res
      .type("text/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">Sorry, something went wrong.</Say><Hangup/></Response>`
      );
  }
});

/** Twilio <Record> action — Whisper → job card, or SMS fallback. */
twilioHooksRouter.post("/voice/recording", async (req, res) => {
  const missedCallId = String(req.query.missedCallId || req.body.missedCallId || "").trim();
  const recordingUrl = String(req.body.RecordingUrl || "").trim();
  const duration = Number(req.body.RecordingDuration || 0);
  const voice = getMissedCallSayVoice();

  try {
    if (!missedCallId) {
      res
        .type("text/xml")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">Thanks. Goodbye.</Say><Hangup/></Response>`
        );
      return;
    }

    const result = await processVoicemailRecording({
      missedCallId,
      recordingUrl,
      recordingDurationSec: Number.isFinite(duration) ? duration : 0,
    });

    if (!result.ok) {
      console.warn("[twilio recording] fallback to SMS", { missedCallId, reason: result.reason });
      await fallbackMissedCallToSms({ missedCallId });
      res
        .type("text/xml")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${escXml(voice)}">Thanks. We'll text you now to take your details.</Say><Hangup/></Response>`
        );
      return;
    }

    if (result.reason === "spam") {
      res
        .type("text/xml")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${escXml(voice)}">Goodbye.</Say><Hangup/></Response>`
        );
      return;
    }

    res
      .type("text/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${escXml(voice)}">Thanks, we've got your message. Someone will be in touch shortly.</Say><Hangup/></Response>`
      );
  } catch (e) {
    console.error("[twilio recording]", e);
    if (missedCallId) {
      try {
        await fallbackMissedCallToSms({ missedCallId });
      } catch (fb) {
        console.error("[twilio recording] fallback failed", fb);
      }
    }
    res
      .type("text/xml")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">Thanks. We'll text you shortly.</Say><Hangup/></Response>`
      );
  }
});

twilioHooksRouter.post("/sms/inbound", async (req, res) => {
  try {
    const from = String(req.body.From || "");
    const to = String(req.body.To || "");
    const body = String(req.body.Body || "");
    const messageSid = String(req.body.MessageSid || "");

    const result = await handleMissedCallInboundSms({ from, to, body, messageSid });
    if (!result.handled) {
      console.log("[twilio sms] unhandled inbound", { from, to, body: body.slice(0, 80) });
    }
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  } catch (e) {
    console.error("[twilio sms]", e);
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
});
