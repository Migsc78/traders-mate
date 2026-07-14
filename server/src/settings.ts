import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./env.js";

const SETTINGS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "settings.local.json");

export interface ApiSettings {
  googlePlacesApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioSmsFrom: string;
  twilioWhatsappFrom: string;
  /** Anthropic API key — quote line extraction via Claude Haiku 4.5 */
  claudeApiKey: string;
  /** Optional OpenAI key — Whisper transcription for voice job cards */
  openaiApiKey: string;
}

const SETTINGS_FIELDS = [
  "googlePlacesApiKey",
  "twilioAccountSid",
  "twilioAuthToken",
  "twilioSmsFrom",
  "twilioWhatsappFrom",
  "claudeApiKey",
  "openaiApiKey",
] as const;

function defaultsFromEnv(): ApiSettings {
  return {
    googlePlacesApiKey: env.GOOGLE_PLACES_API_KEY,
    twilioAccountSid: env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: env.TWILIO_AUTH_TOKEN,
    twilioSmsFrom: env.TWILIO_SMS_FROM,
    twilioWhatsappFrom: env.TWILIO_WHATSAPP_FROM,
    claudeApiKey: env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY || "",
    openaiApiKey: env.OPENAI_API_KEY || "",
  };
}

function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  return !v || v === "your-key-here";
}

function loadFromDisk(): Partial<ApiSettings> {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) as Record<string, string>;
    const patch: Partial<ApiSettings> = {};
    for (const field of SETTINGS_FIELDS) {
      const val = raw[field]?.trim();
      if (val) patch[field] = val;
    }
    return patch;
  } catch {
    return {};
  }
}

function mergeSettings(base: ApiSettings, patch: Partial<ApiSettings>): ApiSettings {
  return {
    googlePlacesApiKey: patch.googlePlacesApiKey ?? base.googlePlacesApiKey,
    twilioAccountSid: patch.twilioAccountSid ?? base.twilioAccountSid,
    twilioAuthToken: patch.twilioAuthToken ?? base.twilioAuthToken,
    twilioSmsFrom: patch.twilioSmsFrom ?? base.twilioSmsFrom,
    twilioWhatsappFrom: patch.twilioWhatsappFrom ?? base.twilioWhatsappFrom,
    claudeApiKey: patch.claudeApiKey ?? base.claudeApiKey,
    openaiApiKey: patch.openaiApiKey ?? base.openaiApiKey,
  };
}

let current: ApiSettings = mergeSettings(defaultsFromEnv(), loadFromDisk());

export function getApiSettings(): Readonly<ApiSettings> {
  return current;
}

export function getGooglePlacesApiKey(): string {
  const key = current.googlePlacesApiKey.trim();
  return isPlaceholder(key) ? "" : key;
}

export function getTwilioAccountSid(): string {
  return current.twilioAccountSid.trim();
}

export function getTwilioAuthToken(): string {
  return current.twilioAuthToken.trim();
}

export function getTwilioSmsFrom(): string {
  return current.twilioSmsFrom.trim();
}

export function getTwilioWhatsappFrom(): string {
  return current.twilioWhatsappFrom.trim();
}

export function twilioConfigured(): boolean {
  return !!(getTwilioAccountSid() && getTwilioAuthToken());
}

export function getClaudeApiKey(): string {
  const key = current.claudeApiKey.trim();
  return isPlaceholder(key) ? "" : key;
}

export function getOpenaiApiKey(): string {
  const key = current.openaiApiKey.trim();
  return isPlaceholder(key) ? "" : key;
}

export function claudeConfigured(): boolean {
  return !!getClaudeApiKey();
}

export function openaiConfigured(): boolean {
  return !!getOpenaiApiKey();
}

export function updateApiSettings(patch: Partial<ApiSettings>): ApiSettings {
  const next = { ...current };
  for (const field of SETTINGS_FIELDS) {
    if (patch[field] !== undefined) next[field] = patch[field]!.trim();
  }
  current = next;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2), "utf8");
  return current;
}

function maskSecret(value: string): { configured: boolean; hint: string | null } {
  const v = value.trim();
  if (isPlaceholder(v)) return { configured: false, hint: null };
  if (v.length <= 4) return { configured: true, hint: "****" };
  return { configured: true, hint: `…${v.slice(-4)}` };
}

function maskPhone(value: string): { configured: boolean; hint: string | null } {
  const v = value.trim();
  if (!v) return { configured: false, hint: null };
  if (v.length <= 4) return { configured: true, hint: v };
  return { configured: true, hint: `…${v.slice(-4)}` };
}

export function publicSettingsView() {
  const s = getApiSettings();
  return {
    googlePlacesApiKey: maskSecret(s.googlePlacesApiKey),
    twilioAccountSid: maskSecret(s.twilioAccountSid),
    twilioAuthToken: maskSecret(s.twilioAuthToken),
    twilioSmsFrom: maskPhone(s.twilioSmsFrom),
    twilioWhatsappFrom: maskPhone(s.twilioWhatsappFrom),
    claudeApiKey: maskSecret(s.claudeApiKey),
    openaiApiKey: maskSecret(s.openaiApiKey),
  };
}
