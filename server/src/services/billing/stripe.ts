import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../env.js";

export type ClientStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";

export function stripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

/**
 * Map a Stripe webhook event type to the client status it implies.
 * Returns null for events we ignore.
 * Prefer subscription.* status mapping for paid-trial flows — invoice.paid alone
 * must not flip TRIAL → ACTIVE (the £14 starter invoice is paid during trial).
 */
export function mapEventToStatus(eventType: string): ClientStatus | null {
  switch (eventType) {
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

/** Map Stripe subscription.status → ClientStatus. */
export function mapSubscriptionStatus(stripeStatus: string): ClientStatus | null {
  switch (stripeStatus) {
    case "trialing":
      return "TRIAL";
    case "active":
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

async function stripeForm(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message || `Stripe ${path} failed (${res.status})`);
  }
  return json;
}

/**
 * Create a Stripe Checkout subscription session.
 * New/unpaid trials: £14 one-time starter + £49/mo with trial_period_days.
 * Existing subscribers (have customer id): monthly price only (no starter fee / trial).
 */
export async function createCheckoutSession(opts: {
  clientId: string;
  customerEmail?: string | null;
  /** When true (default for unpaid trials), charge £14 starter + start 14-day trial on £49/mo. */
  includeStarter?: boolean;
}): Promise<CheckoutResult> {
  if (!stripeConfigured() || !env.STRIPE_PRICE_ID) {
    return { url: `${env.PUBLIC_BASE_URL}/billing/stub?client=${opts.clientId}`, stub: true };
  }

  const includeStarter = opts.includeStarter !== false && !!env.STRIPE_TRIAL_PRICE_ID;
  const trialDays = Math.max(1, Math.round(env.TRIAL_DAYS) || 14);

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", env.STRIPE_PRICE_ID);
  params.set("line_items[0][quantity]", "1");

  if (includeStarter) {
    params.set("line_items[1][price]", env.STRIPE_TRIAL_PRICE_ID);
    params.set("line_items[1][quantity]", "1");
    params.set("subscription_data[trial_period_days]", String(trialDays));
  }

  params.set("success_url", env.STRIPE_SUCCESS_URL || `${env.APP_PUBLIC_URL}/t/settings?billing=success`);
  params.set("cancel_url", env.STRIPE_CANCEL_URL || `${env.APP_PUBLIC_URL}/t/settings?billing=cancel`);
  params.set("client_reference_id", opts.clientId);
  params.set("metadata[clientId]", opts.clientId);
  params.set("subscription_data[metadata][clientId]", opts.clientId);
  if (opts.customerEmail) params.set("customer_email", opts.customerEmail);

  const json = await stripeForm("/checkout/sessions", params);
  const url = typeof json.url === "string" ? json.url : "";
  if (!url) throw new Error("Stripe checkout did not return a URL");
  return { url, stub: false };
}

/** Customer Portal — cancel before day 14, update card, etc. */
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnUrl?: string;
}): Promise<{ url: string }> {
  if (!stripeConfigured()) throw new Error("Stripe is not configured");
  const params = new URLSearchParams();
  params.set("customer", opts.customerId);
  params.set("return_url", opts.returnUrl || `${env.APP_PUBLIC_URL}/t/settings`);
  const json = await stripeForm("/billing_portal/sessions", params);
  const url = typeof json.url === "string" ? json.url : "";
  if (!url) throw new Error("Stripe portal did not return a URL");
  return { url };
}

export async function retrieveSubscription(subscriptionId: string): Promise<{
  id: string;
  status: string;
  customer: string | null;
  trialEnd: Date | null;
  metadata: Record<string, string>;
} | null> {
  if (!stripeConfigured() || !subscriptionId) return null;
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY },
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    customer?: string;
    trial_end?: number | null;
    metadata?: Record<string, string>;
    error?: { message?: string };
  };
  if (!res.ok || !json.id) return null;
  return {
    id: json.id,
    status: json.status || "",
    customer: typeof json.customer === "string" ? json.customer : null,
    trialEnd: json.trial_end ? new Date(json.trial_end * 1000) : null,
    metadata: json.metadata || {},
  };
}
