import { prisma } from "../../db.js";
import { twilioConfigured } from "../../settings.js";
import { sendMessage } from "../messaging/sender.js";
import { appPublicUrl } from "../quotes/magicAuth.js";
import { purchaseAndConfigureUkNumber, configureNumberWebhooks } from "../twilio/numbers.js";
import { env } from "../../env.js";

export const ONBOARDING_LAST_STEP = 6;

function divertCodes(twilioE164: string) {
  const digits = twilioE164.replace(/\D/g, "");
  return {
    noAnswer: `**61*${digits}#`,
    busy: `**67*${digits}#`,
    unreachable: `**62*${digits}#`,
  };
}

/** Buy + attach a Twilio number if the client does not have one yet. */
export async function provisionNumberForClient(clientId: string): Promise<{
  phoneNumber: string | null;
  sid: string | null;
  provisioned: boolean;
  error?: string;
}> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { phoneNumber: null, sid: null, provisioned: false, error: "not_found" };

  if (client.twilioNumber) {
    try {
      await configureNumberWebhooks(client.twilioNumber);
    } catch (e) {
      console.warn("[onboarding] configure existing number failed", e);
    }
    return {
      phoneNumber: client.twilioNumber,
      sid: client.twilioNumberSid,
      provisioned: false,
    };
  }

  if (!twilioConfigured()) {
    return { phoneNumber: null, sid: null, provisioned: false, error: "twilio_not_configured" };
  }

  try {
    const bought = await purchaseAndConfigureUkNumber({
      friendlyName: `TradiesMate ${client.businessName}`.slice(0, 64),
    });
    await prisma.client.update({
      where: { id: clientId },
      data: {
        twilioNumber: bought.phoneNumber,
        twilioNumberSid: bought.sid,
      },
    });
    return { phoneNumber: bought.phoneNumber, sid: bought.sid, provisioned: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[onboarding] provision number failed", clientId, msg);
    return { phoneNumber: null, sid: null, provisioned: false, error: msg };
  }
}

export async function sendWelcomeOnboardingSms(clientId: string): Promise<boolean> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client?.destPhone) return false;
  if (client.welcomeSmsSentAt) return false;

  const numberLine = client.twilioNumber
    ? `Your TradiesMate number: ${client.twilioNumber}`
    : `We're assigning your TradiesMate number now.`;
  const url = `${appPublicUrl()}/t/onboarding`;
  const trialNote =
    client.trialEndsAt && env.SAAS_PLAN_PRICE_PENCE
      ? `\nTrial ends ${client.trialEndsAt.toLocaleDateString("en-GB")} — then £${(env.SAAS_PLAN_PRICE_PENCE / 100).toFixed(0)}/30 days unless you cancel.`
      : "";

  const body = `You're in — TradiesMate.\n${numberLine}\n\nNext: set call divert (~2 min):\n${url}${trialNote}`;

  const results = await sendMessage({
    to: client.destPhone,
    // Onboarding must reach the tradie reliably — prefer SMS even if their job alerts are WhatsApp.
    channel: "SMS",
    body,
  });
  const ok = results.some((r) => r.ok);
  if (ok) {
    await prisma.client.update({
      where: { id: clientId },
      data: { welcomeSmsSentAt: new Date() },
    });
  }
  return ok;
}

/**
 * After Stripe starter payment unlocks the account: provision number + welcome SMS.
 * Safe to call repeatedly (idempotent).
 */
export async function startOnboardingAfterPayment(clientId: string): Promise<void> {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return;
  if (!client.stripeCustomerId) return;
  if (client.onboardingCompletedAt) return;

  await provisionNumberForClient(clientId);
  await sendWelcomeOnboardingSms(clientId).catch((e) =>
    console.warn("[onboarding] welcome SMS failed", e)
  );
}

export async function markOnboardingTestCallIfNeeded(clientId: string): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      onboardingCompletedAt: true,
      onboardingTestCallAt: true,
      onboardingStep: true,
    },
  });
  if (!client) return;
  if (client.onboardingCompletedAt || client.onboardingTestCallAt) return;
  // Only stamp while they're in (or about to enter) the test step
  if (client.onboardingStep < 2) return;

  await prisma.client.update({
    where: { id: clientId },
    data: {
      onboardingTestCallAt: new Date(),
      onboardingStep: Math.max(client.onboardingStep, 3),
    },
  });
}

export function buildOnboardingView(client: {
  id: string;
  businessName: string;
  tradeTitle: string | null;
  destPhone: string;
  twilioNumber: string | null;
  twilioNumberSid: string | null;
  onboardingStep: number;
  onboardingCompletedAt: Date | null;
  onboardingDivertConfirmedAt: Date | null;
  onboardingTestCallAt: Date | null;
  welcomeSmsSentAt: Date | null;
  bankName: string | null;
  bankSortCode: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  stripeConnectOnboarded: boolean;
  trialEndsAt: Date | null;
  status: string;
}) {
  const codes = client.twilioNumber ? divertCodes(client.twilioNumber) : null;
  const step = Math.max(0, Math.min(ONBOARDING_LAST_STEP, client.onboardingStep || 0));
  return {
    step,
    lastStep: ONBOARDING_LAST_STEP,
    completed: !!client.onboardingCompletedAt,
    completedAt: client.onboardingCompletedAt?.toISOString() ?? null,
    divertConfirmed: !!client.onboardingDivertConfirmedAt,
    divertConfirmedAt: client.onboardingDivertConfirmedAt?.toISOString() ?? null,
    testCallAt: client.onboardingTestCallAt?.toISOString() ?? null,
    welcomeSmsSentAt: client.welcomeSmsSentAt?.toISOString() ?? null,
    twilioNumber: client.twilioNumber,
    hasNumber: !!client.twilioNumber,
    divertCodes: codes,
    destPhone: client.destPhone,
    businessName: client.businessName,
    tradeTitle: client.tradeTitle,
    bank: {
      bankName: client.bankName,
      bankSortCode: client.bankSortCode,
      bankAccountName: client.bankAccountName,
      bankAccountNumber: client.bankAccountNumber,
    },
    stripeConnectOnboarded: client.stripeConnectOnboarded,
    trialEndsAt: client.trialEndsAt?.toISOString() ?? null,
    status: client.status,
    trialDays: env.TRIAL_DAYS,
    trialPricePence: env.SAAS_TRIAL_PRICE_PENCE,
    planPricePence: env.SAAS_PLAN_PRICE_PENCE,
  };
}

export type OnboardingView = ReturnType<typeof buildOnboardingView>;
