import { prisma } from "../db.js";
import { env } from "../env.js";

const KEYS = {
  ukBundleSid: "twilio.ukBundleSid",
  ukAddressSid: "twilio.ukAddressSid",
  ukLocalBundleSid: "twilio.ukLocalBundleSid",
} as const;

const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 30_000;

async function readDb(key: string): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const row = await prisma.appConfig.findUnique({ where: { key } });
  const value = row?.value?.trim() || "";
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function getConfig(key: string): Promise<string> {
  return readDb(key);
}

export async function setConfig(key: string, value: string): Promise<void> {
  const v = value.trim();
  await prisma.appConfig.upsert({
    where: { key },
    create: { key, value: v },
    update: { value: v },
  });
  cache.set(key, { value: v, at: Date.now() });
}

export function clearConfigCache() {
  cache.clear();
}

/** Env wins, then AppConfig DB. */
export async function getTwilioUkBundleSid(): Promise<string> {
  return env.TWILIO_UK_BUNDLE_SID.trim() || (await readDb(KEYS.ukBundleSid));
}

export async function getTwilioUkAddressSid(): Promise<string> {
  return env.TWILIO_UK_ADDRESS_SID.trim() || (await readDb(KEYS.ukAddressSid));
}

export async function getTwilioUkLocalBundleSid(): Promise<string> {
  return (await readDb(KEYS.ukLocalBundleSid)) || "";
}

export const APP_CONFIG_KEYS = KEYS;
