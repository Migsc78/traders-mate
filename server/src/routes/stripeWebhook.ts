import { Router } from "express";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { verifyStripeSignature, mapEventToStatus, mapSubscriptionStatus } from "../services/billing/stripe.js";

// Public Stripe webhook. Mounted with express.raw so we can verify the signature.
export const stripeWebhookRouter = Router();

stripeWebhookRouter.post("/", async (req, res) => {
  const sig = req.header("stripe-signature") || "";
  const payload = (req.body as Buffer)?.toString("utf8") || "";

  if (env.STRIPE_WEBHOOK_SECRET) {
    if (!verifyStripeSignature(payload, sig, env.STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).json({ error: "invalid signature" });
    }
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return res.status(400).json({ error: "invalid payload" });
  }

  const obj = event.data?.object ?? {};
  const customerId = (obj.customer as string) || undefined;
  const clientRef = (obj.client_reference_id as string) || undefined;

  let status = mapEventToStatus(event.type || "");
  if (event.type === "customer.subscription.updated" && typeof obj.status === "string") {
    status = mapSubscriptionStatus(obj.status);
  }

  if (status) {
    try {
      if (clientRef) {
        await prisma.client.update({ where: { id: clientRef }, data: { status } }).catch(() => undefined);
      }
      if (customerId) {
        await prisma.client.updateMany({ where: { stripeCustomerId: customerId }, data: { status } });
      }
    } catch (e) {
      console.error("[stripe] status update failed", e);
    }
  }

  res.json({ received: true });
});
