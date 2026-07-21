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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Download a Twilio RecordingUrl (requires account Basic auth). Retries; tries wav then mp3. */
export async function downloadTwilioRecording(
  recordingUrl: string
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!twilioConfigured()) throw new Error("Twilio is not configured");
  const base = recordingUrl.replace(/\.(wav|mp3)$/i, "");
  const attempts: Array<{ url: string; contentType: string }> = [
    { url: `${base}.wav`, contentType: "audio/wav" },
    { url: `${base}.mp3`, contentType: "audio/mpeg" },
    { url: base, contentType: "audio/wav" },
  ];

  let lastErr: Error | null = null;
  for (let round = 0; round < 3; round++) {
    if (round > 0) await sleep(800 * round);
    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, {
          headers: { Authorization: authHeader() },
          redirect: "follow",
        });
        if (!res.ok) {
          lastErr = new Error(`Twilio recording download failed (${res.status}) ${attempt.url}`);
          continue;
        }
        const ab = await res.arrayBuffer();
        const buffer = Buffer.from(ab);
        if (buffer.length < 100) {
          lastErr = new Error("Twilio recording empty/too small");
          continue;
        }
        return {
          buffer,
          contentType: res.headers.get("content-type") || attempt.contentType,
        };
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
  }
  throw lastErr || new Error("Twilio recording download failed");
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

export type IncomingNumberDetail = IncomingNumber & {
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  dateCreated: string | null;
};

/** List all Incoming Phone Numbers on the Twilio account (up to 200). */
export async function listIncomingNumbers(): Promise<IncomingNumberDetail[]> {
  if (!twilioConfigured()) throw new Error("Twilio is not configured");
  const out: IncomingNumberDetail[] = [];
  let url: string | null = `${accountBase()}/IncomingPhoneNumbers.json?PageSize=100`;
  while (url && out.length < 200) {
    const res = await fetch(url, { headers: { Authorization: authHeader() } });
    const json = (await res.json().catch(() => ({}))) as {
      incoming_phone_numbers?: Array<{
        sid: string;
        phone_number: string;
        friendly_name?: string;
        voice_url?: string;
        sms_url?: string;
        status_callback?: string;
        capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean };
        date_created?: string;
      }>;
      next_page_uri?: string | null;
      message?: string;
    };
    if (!res.ok) throw new Error(json.message || `Twilio list numbers failed (${res.status})`);
    for (const n of json.incoming_phone_numbers || []) {
      out.push({
        sid: n.sid,
        phoneNumber: n.phone_number,
        friendlyName: n.friendly_name ?? null,
        voiceUrl: n.voice_url || null,
        smsUrl: n.sms_url || null,
        statusCallback: n.status_callback || null,
        capabilities: {
          voice: !!n.capabilities?.voice,
          sms: !!n.capabilities?.sms,
          mms: !!n.capabilities?.mms,
        },
        dateCreated: n.date_created ?? null,
      });
    }
    url = json.next_page_uri ? `https://api.twilio.com${json.next_page_uri}` : null;
  }
  return out;
}

export type TwilioUsageRecord = {
  category: string;
  description: string;
  count: string;
  countUnit: string;
  usage: string;
  usageUnit: string;
  price: string;
  priceUnit: string;
  startDate: string;
  endDate: string;
};

type UsagePeriod = "Today" | "Yesterday" | "ThisMonth" | "LastMonth" | "AllTime";

/** Fetch Twilio Usage Records for a built-in period (all categories). */
export async function fetchUsageRecords(period: UsagePeriod): Promise<TwilioUsageRecord[]> {
  if (!twilioConfigured()) throw new Error("Twilio is not configured");
  const url = `${accountBase()}/Usage/Records/${period}.json?PageSize=1000`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  const json = (await res.json().catch(() => ({}))) as {
    usage_records?: Array<{
      category?: string;
      description?: string;
      count?: string;
      count_unit?: string;
      usage?: string;
      usage_unit?: string;
      price?: string;
      price_unit?: string;
      start_date?: string;
      end_date?: string;
    }>;
    message?: string;
  };
  if (!res.ok) throw new Error(json.message || `Twilio usage failed (${res.status})`);
  return (json.usage_records || []).map((r) => ({
    category: r.category || "",
    description: r.description || "",
    count: r.count || "0",
    countUnit: r.count_unit || "",
    usage: r.usage || "0",
    usageUnit: r.usage_unit || "",
    price: r.price || "0",
    priceUnit: r.price_unit || "USD",
    startDate: r.start_date || "",
    endDate: r.end_date || "",
  }));
}

export async function fetchAccountBalance(): Promise<{
  currency: string;
  balance: string;
} | null> {
  if (!twilioConfigured()) return null;
  const res = await fetch(`${accountBase()}/Balance.json`, {
    headers: { Authorization: authHeader() },
  });
  const json = (await res.json().catch(() => ({}))) as {
    currency?: string;
    balance?: string;
    message?: string;
  };
  if (!res.ok) return null;
  return {
    currency: json.currency || "USD",
    balance: json.balance || "0",
  };
}

export async function fetchAccountInfo(): Promise<{
  friendlyName: string | null;
  status: string | null;
  type: string | null;
} | null> {
  if (!twilioConfigured()) return null;
  const res = await fetch(`${accountBase()}.json`, {
    headers: { Authorization: authHeader() },
  });
  const json = (await res.json().catch(() => ({}))) as {
    friendly_name?: string;
    status?: string;
    type?: string;
  };
  if (!res.ok) return null;
  return {
    friendlyName: json.friendly_name ?? null,
    status: json.status ?? null,
    type: json.type ?? null,
  };
}

export { voiceWebhookUrl, smsWebhookUrl, digitsOnly };

/**
 * Search available UK numbers (Local first, then Mobile) that support voice + SMS.
 */
export async function searchAvailableUkNumbers(opts?: {
  limit?: number;
}): Promise<Array<{ phoneNumber: string; friendlyName: string | null; type: "Local" | "Mobile" }>> {
  if (!twilioConfigured()) throw new Error("Twilio is not configured");
  const limit = Math.min(20, Math.max(1, opts?.limit ?? 5));
  const out: Array<{ phoneNumber: string; friendlyName: string | null; type: "Local" | "Mobile" }> = [];

  for (const type of ["Local", "Mobile"] as const) {
    if (out.length >= limit) break;
    const url =
      `${accountBase()}/AvailablePhoneNumbers/GB/${type}.json` +
      `?VoiceEnabled=true&SmsEnabled=true&PageSize=${limit}`;
    const res = await fetch(url, { headers: { Authorization: authHeader() } });
    const json = (await res.json().catch(() => ({}))) as {
      available_phone_numbers?: Array<{ phone_number?: string; friendly_name?: string }>;
      message?: string;
    };
    if (!res.ok) {
      // Mobile may be unavailable on some accounts — continue to next type
      console.warn(`[twilio] available ${type} search failed`, json.message || res.status);
      continue;
    }
    for (const n of json.available_phone_numbers || []) {
      if (!n.phone_number) continue;
      out.push({
        phoneNumber: n.phone_number,
        friendlyName: n.friendly_name ?? null,
        type,
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Purchase a specific Twilio number and return sid + E.164. */
export async function purchasePhoneNumber(opts: {
  phoneNumber: string;
  friendlyName?: string;
}): Promise<{ sid: string; phoneNumber: string }> {
  if (!twilioConfigured()) throw new Error("Twilio is not configured");
  const voiceUrl = voiceWebhookUrl();
  const smsUrl = smsWebhookUrl();
  const params = new URLSearchParams({
    PhoneNumber: opts.phoneNumber,
    VoiceUrl: voiceUrl,
    VoiceMethod: "POST",
    SmsUrl: smsUrl,
    SmsMethod: "POST",
    FriendlyName: opts.friendlyName || `TradiesMate ${opts.phoneNumber}`,
  });
  const res = await fetch(`${accountBase()}/IncomingPhoneNumbers.json`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as {
    sid?: string;
    phone_number?: string;
    message?: string;
  };
  if (!res.ok || !json.sid || !json.phone_number) {
    throw new Error(json.message || `Twilio purchase failed (${res.status})`);
  }
  return { sid: json.sid, phoneNumber: json.phone_number };
}

/** Buy first available UK voice+SMS number and wire webhooks. */
export async function purchaseAndConfigureUkNumber(opts: {
  friendlyName?: string;
}): Promise<{ sid: string; phoneNumber: string }> {
  const available = await searchAvailableUkNumbers({ limit: 5 });
  if (!available.length) {
    throw new Error("No UK Twilio numbers available to purchase right now — try again shortly");
  }
  return purchasePhoneNumber({
    phoneNumber: available[0].phoneNumber,
    friendlyName: opts.friendlyName,
  });
}
