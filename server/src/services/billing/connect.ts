import { env } from "../../env.js";
import {
  createCheckoutSession as createSaasCheckout,
  stripeConfigured,
  verifyStripeSignature,
  mapEventToStatus,
  mapSubscriptionStatus,
} from "./stripe.js";

export {
  createSaasCheckout as createCheckoutSession,
  stripeConfigured,
  verifyStripeSignature,
  mapEventToStatus,
  mapSubscriptionStatus,
};

function authHeader(): Record<string, string> {
  return {
    Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function stripePost(path: string, params: URLSearchParams, extraHeaders?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: { ...authHeader(), ...(extraHeaders || {}) },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
    id?: string;
    url?: string;
  };
  if (!res.ok) throw new Error(json.error?.message || `Stripe ${path} failed (${res.status})`);
  return json;
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message || `Stripe GET ${path} failed (${res.status})`);
  return json;
}

/** Create or reuse a Stripe Connect Express account for a tradie. */
export async function ensureConnectAccount(opts: {
  clientId: string;
  email?: string | null;
  existingAccountId?: string | null;
}): Promise<{ accountId: string }> {
  if (!stripeConfigured()) throw new Error("Stripe is not configured");
  if (opts.existingAccountId) return { accountId: opts.existingAccountId };

  const params = new URLSearchParams();
  params.set("type", "express");
  params.set("country", "GB");
  params.set("capabilities[card_payments][requested]", "true");
  params.set("capabilities[transfers][requested]", "true");
  params.set("business_type", "individual");
  params.set("metadata[clientId]", opts.clientId);
  if (opts.email) params.set("email", opts.email);

  const json = await stripePost("/accounts", params);
  return { accountId: String(json.id) };
}

/** Account-link for Connect Express onboarding. */
export async function createConnectOnboardingLink(opts: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  if (!stripeConfigured()) throw new Error("Stripe is not configured");
  const params = new URLSearchParams();
  params.set("account", opts.accountId);
  params.set("refresh_url", opts.refreshUrl);
  params.set("return_url", opts.returnUrl);
  params.set("type", "account_onboarding");
  const json = await stripePost("/account_links", params);
  return { url: String(json.url) };
}

export async function getConnectAccountStatus(accountId: string): Promise<{
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
}> {
  if (!stripeConfigured()) return { chargesEnabled: false, detailsSubmitted: false };
  const json = await stripeGet(`/accounts/${accountId}`);
  return {
    chargesEnabled: !!json.charges_enabled,
    detailsSubmitted: !!json.details_submitted,
  };
}

/**
 * Checkout session that pays the tradie's Connect account (destination charge).
 * Falls back to a stub URL when Stripe isn't configured.
 */
export async function createConnectPaymentCheckout(opts: {
  connectedAccountId: string;
  amountPence: number;
  currency?: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  clientId: string;
  metadata: Record<string, string>;
}): Promise<{ url: string; sessionId: string | null; stub: boolean }> {
  if (!stripeConfigured() || !opts.connectedAccountId || opts.amountPence <= 0) {
    return {
      url: opts.successUrl + (opts.successUrl.includes("?") ? "&" : "?") + "stub=1",
      sessionId: null,
      stub: true,
    };
  }

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", opts.successUrl);
  params.set("cancel_url", opts.cancelUrl);
  params.set("line_items[0][price_data][currency]", (opts.currency || "gbp").toLowerCase());
  params.set("line_items[0][price_data][product_data][name]", opts.description.slice(0, 120));
  params.set("line_items[0][price_data][unit_amount]", String(opts.amountPence));
  params.set("line_items[0][quantity]", "1");
  params.set("payment_intent_data[transfer_data][destination]", opts.connectedAccountId);
  params.set("payment_intent_data[metadata][clientId]", opts.clientId);
  for (const [k, v] of Object.entries(opts.metadata)) {
    params.set(`metadata[${k}]`, v);
    params.set(`payment_intent_data[metadata][${k}]`, v);
  }

  const json = await stripePost("/checkout/sessions", params);
  return { url: String(json.url), sessionId: String(json.id), stub: false };
}
