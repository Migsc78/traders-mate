import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../env.js";

export type ClientStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";

export function stripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

/**
 * Map a Stripe webhook event type to the client status it implies.
 * Returns null for events we ignore.
 */
export function mapEventToStatus(eventType: string): ClientStatus | null {
  switch (eventType) {
    case "invoice.paid":
    case "invoice.payment_succeeded":
    case "customer.subscription.created":
      return "ACTIVE";
    case "invoice.payment_failed":
      return "PAST_DUE";
    case "customer.subscription.deleted":
      return "CANCELLED";
    case "customer.subscription.paused":
      return "SUSPENDED";
    default:
      return null;
  }
}

// A subscription.updated event carries a status we translate directly.
export function mapSubscriptionStatus(stripeStatus: string): ClientStatus | null {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "paused":
      return "SUSPENDED";
    case "canceled":
      return "CANCELLED";
    default:
      return null;
  }
}

/**
 * Verify a Stripe webhook signature (t=…,v1=…) without the SDK.
 * Pure + testable. Tolerance in seconds guards against replay.
 */
export function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  toleranceSec = 300,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!secret || !sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k, v];
    })
  ) as { t?: string; v1?: string };
  if (!parts.t || !parts.v1) return false;

  const ts = parseInt(parts.t, 10);
  if (Number.isNaN(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;

  const expected = createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface CheckoutResult {
  url: string;
  stub: boolean;
}

/**
 * Create a Stripe Checkout subscription session via the REST API.
 * Falls back to a stub URL when Stripe isn't configured, so the flow is demoable.
 */
export async function createCheckoutSession(opts: {
  clientId: string;
  customerEmail?: string | null;
}): Promise<CheckoutResult> {
  if (!stripeConfigured() || !env.STRIPE_PRICE_ID) {
    return { url: `${env.PUBLIC_BASE_URL}/billing/stub?client=${opts.clientId}`, stub: true };
  }
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", env.STRIPE_PRICE_ID);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", env.STRIPE_SUCCESS_URL || `${env.PUBLIC_BASE_URL}/billing/success`);
  params.set("cancel_url", env.STRIPE_CANCEL_URL || `${env.PUBLIC_BASE_URL}/billing/cancel`);
  params.set("client_reference_id", opts.clientId);
  if (opts.customerEmail) params.set("customer_email", opts.customerEmail);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: { message?: string } };
  if (!res.ok || !json.url) {
    throw new Error(json.error?.message || `Stripe checkout failed (${res.status})`);
  }
  return { url: json.url, stub: false };
}
