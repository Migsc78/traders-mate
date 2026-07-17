import {
  getTwilioAccountSid,
  getTwilioAuthToken,
  twilioConfigured,
} from "../../settings.js";
import { env } from "../../env.js";
import { toE164UK } from "../messaging/sender.js";

function authHeader(): string {
  const sid = getTwilioAccountSid();
  const token = getTwilioAuthToken();
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

function accountBase(): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${getTwilioAccountSid()}`;
}

export type IncomingNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName: string | null;
  voiceUrl: string | null;
  smsUrl: string | null;
  statusCallback: string | null;
};

function voiceWebhookUrl(): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/twilio/voice/missed`;
}

function smsWebhookUrl(): string {
  return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/api/twilio/sms/inbound`;
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Find an Incoming Phone Number on this Twilio account that matches the given phone. */
export async function findIncomingNumber(phone: string): Promise<IncomingNumber | null> {
  if (!twilioConfigured()) throw new Error("Twilio is not configured on the server");
  const want = digitsOnly(toE164UK(phone));
  const url = `${accountBase()}/IncomingPhoneNumbers.json?PageSize=100`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  const json = (await res.json().catch(() => ({}))) as {
    incoming_phone_numbers?: Array<{
      sid: string;
      phone_number: string;
      friendly_name?: string;
      voice_url?: string;
      sms_url?: string;
      status_callback?: string;
    }>;
    message?: string;
  };
  if (!res.ok) throw new Error(json.message || `Twilio list numbers failed (${res.status})`);

  const match = (json.incoming_phone_numbers || []).find((n) => digitsOnly(n.phone_number) === want);
  if (!match) return null;
  return {
    sid: match.sid,
    phoneNumber: match.phone_number,
    friendlyName: match.friendly_name ?? null,
    voiceUrl: match.voice_url || null,
    smsUrl: match.sms_url || null,
    statusCallback: match.status_callback || null,
  };
}

/**
 * Point Voice + SMS webhooks on a Twilio number at our Railway handlers.
 * Without this, callers hear Twilio’s “configure a Voice URL” message.
 */
export async function configureNumberWebhooks(phone: string): Promise<{
  phoneNumber: string;
  voiceUrl: string;
  smsUrl: string;
  alreadyOk: boolean;
}> {
  const existing = await findIncomingNumber(phone);
  if (!existing) {
    throw new Error(
      `Twilio number ${toE164UK(phone)} was not found on this account. Buy/assign it in Twilio first, or check the number format (+44…).`
    );
  }

  const voiceUrl = voiceWebhookUrl();
  const smsUrl = smsWebhookUrl();
  const alreadyOk =
    (existing.voiceUrl || "").replace(/\/$/, "") === voiceUrl.replace(/\/$/, "") &&
    (existing.smsUrl || "").replace(/\/$/, "") === smsUrl.replace(/\/$/, "");

  if (alreadyOk) {
    return { phoneNumber: existing.phoneNumber, voiceUrl, smsUrl, alreadyOk: true };
  }

  const params = new URLSearchParams({
    VoiceUrl: voiceUrl,
    VoiceMethod: "POST",
    SmsUrl: smsUrl,
    SmsMethod: "POST",
    FriendlyName: existing.friendlyName || `TradiesMate ${existing.phoneNumber}`,
  });

  const res = await fetch(`${accountBase()}/IncomingPhoneNumbers/${existing.sid}.json`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; phone_number?: string };
  if (!res.ok) throw new Error(json.message || `Twilio configure failed (${res.status})`);

  return {
    phoneNumber: json.phone_number || existing.phoneNumber,
    voiceUrl,
    smsUrl,
    alreadyOk: false,
  };
}

export async function getNumberWebhookStatus(phone: string): Promise<{
  found: boolean;
  phoneNumber?: string;
  voiceUrl?: string | null;
  smsUrl?: string | null;
  voiceOk: boolean;
  smsOk: boolean;
  expectedVoiceUrl: string;
  expectedSmsUrl: string;
}> {
  const expectedVoiceUrl = voiceWebhookUrl();
  const expectedSmsUrl = smsWebhookUrl();
  if (!twilioConfigured()) {
    return { found: false, voiceOk: false, smsOk: false, expectedVoiceUrl, expectedSmsUrl };
  }
  const n = await findIncomingNumber(phone);
  if (!n) {
    return { found: false, voiceOk: false, smsOk: false, expectedVoiceUrl, expectedSmsUrl };
  }
  const voiceOk = (n.voiceUrl || "").replace(/\/$/, "") === expectedVoiceUrl.replace(/\/$/, "");
  const smsOk = (n.smsUrl || "").replace(/\/$/, "") === expectedSmsUrl.replace(/\/$/, "");
  return {
    found: true,
    phoneNumber: n.phoneNumber,
    voiceUrl: n.voiceUrl,
    smsUrl: n.smsUrl,
    voiceOk,
    smsOk,
    expectedVoiceUrl,
    expectedSmsUrl,
  };
}
