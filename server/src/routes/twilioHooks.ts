import { Router } from "express";
import { prisma } from "../db.js";
import { sendMessage, toE164UK } from "../services/messaging/sender.js";
import { logMessage } from "../services/messaging/log.js";
import { handleMissedCallInboundSms } from "../services/receptionist/smsQualifier.js";
import {
  fillTemplate,
  getMissedCallSayText,
  getMissedCallSayVoice,
  getMissedCallSmsText,
} from "../settings.js";

export const twilioHooksRouter = Router();

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function handleMissedVoice(opts: {
  to: string;
  from: string;
  callSid: string;
  clientHint?: { id: string; businessName: string; destPhone: string; destChannel: "SMS" | "WHATSAPP" | "BOTH" };
}) {
  const to = toE164UK(opts.to);
  const from = toE164UK(opts.from);

  const client =
    opts.clientHint ||
    (await prisma.client.findFirst({ where: { twilioNumber: { contains: to.replace(/\D/g, "").slice(-10) } } })) ||
    (await prisma.client.findFirst({ where: { twilioNumber: to } }));

  if (!client || !from) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">Sorry, this number is not configured.</Say><Hangup/></Response>`;
  }

  const greetingRow = await prisma.client.findUnique({
    where: { id: client.id },
    select: { greetingAudioUrl: true },
  });
  const greetingUrl = greetingRow?.greetingAudioUrl?.trim() || null;

  await prisma.missedCall.create({
    data: {
      clientId: client.id,
      callerPhone: from,
      status: "PENDING",
      callSid: opts.callSid || null,
      conversation: [],
    },
  });

  const vars = { businessName: client.businessName };
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

  // Prefer the tradie's recorded greeting (Twilio <Play>); fall back to Polly TTS.
  if (greetingUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${escXml(greetingUrl)}</Play><Hangup/></Response>`;
  }

  const say = fillTemplate(getMissedCallSayText(), vars);
  const voice = getMissedCallSayVoice();
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
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">Sorry, something went wrong.</Say><Hangup/></Response>`);
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
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Amy">Sorry, something went wrong.</Say><Hangup/></Response>`);
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
