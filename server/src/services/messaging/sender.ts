import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  getTwilioSmsFrom,
  getTwilioWhatsappFrom,
  twilioConfigured as settingsTwilioConfigured,
} from "../../settings.js";

export type Channel = "WHATSAPP" | "SMS" | "BOTH";
export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  via: "twilio-sms" | "twilio-whatsapp" | "stub";
}

// Normalise a UK number to E.164 (+44…). Leaves already-E.164 numbers alone.
export function toE164UK(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+44" + digits.slice(1);
  if (digits.startsWith("44")) return "+" + digits;
  if (digits.length === 10 && digits.startsWith("7")) return "+44" + digits;
  return digits;
}

export function twilioConfigured(): boolean {
  return settingsTwilioConfigured();
}

async function twilioSend(
  to: string,
  from: string,
  body: string,
  via: "twilio-sms" | "twilio-whatsapp"
): Promise<SendResult> {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { ok: false, error: json.message || `Twilio ${res.status}`, via };
    return { ok: true, id: json.sid, via };
  } catch (e) {
    return { ok: false, error: (e as Error).message, via };
  }
}

/**
 * Send a message to a destination number over the requested channel(s).
 * Forwarding model: `to` is the tradie's own number. Falls back to a logging
 * stub when Twilio isn't configured, so the whole flow works in dev/demo.
 */
export async function sendMessage(opts: { to: string; channel: Channel; body: string }): Promise<SendResult[]> {
  const to = toE164UK(opts.to);
  const wantSms = opts.channel === "SMS" || opts.channel === "BOTH";
  const wantWa = opts.channel === "WHATSAPP" || opts.channel === "BOTH";
  const smsFrom = getTwilioSmsFrom();
  const whatsappFrom = getTwilioWhatsappFrom();

  if (!twilioConfigured()) {
    console.log(`[messaging:stub] would send ${opts.channel} to ${to}: ${opts.body.slice(0, 100)}`);
    return [{ ok: true, id: "stub", via: "stub" }];
  }

  const results: SendResult[] = [];
  if (wantWa && whatsappFrom) {
    results.push(
      await twilioSend("whatsapp:" + to, "whatsapp:" + whatsappFrom, opts.body, "twilio-whatsapp")
    );
  }
  if (wantSms && smsFrom) {
    results.push(await twilioSend(to, smsFrom, opts.body, "twilio-sms"));
  }
  if (results.length === 0) {
    console.log(`[messaging:stub] no Twilio 'From' set for channel ${opts.channel}; not sent to ${to}`);
    results.push({ ok: true, id: "stub", via: "stub" });
  }
  return results;
}
