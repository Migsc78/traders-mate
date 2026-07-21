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
  // Path param (not query) — cleaner Twilio signature validation.
  return `${base}/api/twilio/voice/recording/${encodeURIComponent(missedCallId)}`;
}

function greetingPlayUrl(token: string): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/public/greeting/${encodeURIComponent(token)}`;
}

/** Prefer durable DB greeting; never <Play> a dead /uploads URL (causes Twilio "application error"). */
async function resolveGreetingPlayUrl(clientId: string): Promise<string | null> {
  const row = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      greetingPlayToken: true,
      greetingAudioData: true,
      greetingAudioUrl: true,
    },
  });
  if (row?.greetingPlayToken && row.greetingAudioData && row.greetingAudioData.length > 100) {
    return greetingPlayUrl(row.greetingPlayToken);
  }
  // Legacy disk URL — only use if still reachable after redeploys.
  const legacy = row?.greetingAudioUrl?.trim() || null;
  if (!legacy || legacy.includes("/api/public/greeting/")) return null;
  try {
    const head = await fetch(legacy, { method: "HEAD" });
    if (head.ok) return legacy;
  } catch {
    /* fall through */
  }
  return null;
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

  // Always re-read mode from DB (raw) so a stale Prisma client can't force SMS.
  const [row] = await prisma.$queryRaw<Array<{ missedCallMode: string }>>`
    SELECT "missedCallMode"::text AS "missedCallMode" FROM "Client" WHERE id = ${client.id} LIMIT 1
  `;
  const greetingUrl = await resolveGreetingPlayUrl(client.id);
  const mode = (row?.missedCallMode || "SMS_QUALIFY").trim().toUpperCase();
  const useVoicemail = mode === "VOICEMAIL";

  console.log("[twilio voice] rescue decision", {
    clientId: client.id,
    mode,
    useVoicemail,
    openai: openaiConfigured(),
    callSid: opts.callSid || null,
  });

  if (useVoicemail && !openaiConfigured()) {
    console.warn(
      "[twilio voice] VOICEMAIL mode but OpenAI/Whisper not configured — will Record then SMS-fallback if transcribe fails",
      { clientId: client.id }
    );
  }

  const missed = await prisma.missedCall.create({
    data: {
      clientId: client.id,
      callerPhone: from,
      status: "PENDING",
      callSid: opts.callSid || null,
      conversation: [
        {
          role: "assistant",
          text: `[system] rescueMode=${mode} useVoicemail=${useVoicemail}`,
          at: new Date().toISOString(),
        },
      ],
    },
  });

  void import("../services/onboarding/onboarding.js")
    .then((m) => m.markOnboardingTestCallIfNeeded(client.id))
    .catch(() => undefined);

  const vars = { businessName: client.businessName };
  const voice = getMissedCallSayVoice();

  if (useVoicemail) {
    const action = escXml(recordingActionUrl(missed.id));
    const parts: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?><Response><!-- tm-voicemail-v4 -->',
    ];
    // Custom greeting already tells them what to leave — go straight to beep.
    // Only use TTS when there is no recorded greeting.
    if (greetingUrl) {
      parts.push(`<Play>${escXml(greetingUrl)}</Play>`);
    } else {
      parts.push(
        `<Say voice="${escXml(voice)}"><break strength="x-weak"/>Sorry we missed your call at ${escXml(client.businessName)}. ${escXml(VOICEMAIL_PROMPT)}</Say>`
      );
    }
    parts.push(
      `<Record maxLength="90" playBeep="true" timeout="6" action="${action}" method="POST" />`
    );
    parts.push("<Hangup/></Response>");
    return parts.join("");
  }

  // SMS qualify path (default) — only when mode is not VOICEMAIL
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

/**
 * Twilio <Record> action.
 * Reply immediately so Twilio doesn't time out while Whisper runs, then process async.
 */
async function handleRecordingCallback(req: import("express").Request, res: import("express").Response) {
  const missedCallId = String(req.params.missedCallId || req.query.missedCallId || req.body.missedCallId || "").trim();
  const recordingUrl = String(req.body.RecordingUrl || "").trim();
  const recordingStatus = String(req.body.RecordingStatus || "").trim().toLowerCase();
  const duration = Number(req.body.RecordingDuration || 0);
  const voice = getMissedCallSayVoice();

  // Status callbacks fire with RecordingStatus=completed|absent — ignore non-completed.
  if (recordingStatus && recordingStatus !== "completed") {
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    return;
  }

  // Always ACK Twilio first (Whisper + Haiku can exceed Twilio's action timeout).
  res
    .type("text/xml")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${escXml(voice)}">Thanks, we've got your message. Someone will be in touch shortly.</Say><Hangup/></Response>`
    );

  if (!missedCallId || !recordingUrl) {
    console.warn("[twilio recording] missing id or url", { missedCallId, hasUrl: !!recordingUrl });
    return;
  }

  void (async () => {
    try {
      // Brief pause so Twilio media is fully available after hangup.
      await new Promise((r) => setTimeout(r, 1200));
      const result = await processVoicemailRecording({
        missedCallId,
        recordingUrl,
        recordingDurationSec: Number.isFinite(duration) ? duration : 0,
      });
      if (!result.ok) {
        console.warn("[twilio recording] fallback to SMS", { missedCallId, reason: result.reason });
        await fallbackMissedCallToSms({ missedCallId });
      }
    } catch (e) {
      console.error("[twilio recording] async process failed", e);
      try {
        await fallbackMissedCallToSms({ missedCallId });
      } catch (fb) {
        console.error("[twilio recording] fallback failed", fb);
      }
    }
  })();
}

twilioHooksRouter.post("/voice/recording/:missedCallId", handleRecordingCallback);
twilioHooksRouter.post("/voice/recording", handleRecordingCallback);

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
