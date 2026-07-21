import { Router } from "express";
import { env } from "../env.js";
import { prisma } from "../db.js";
import {
  verifyStripeSignature,
  mapEventToStatus,
  mapSubscriptionStatus,
  retrieveSubscription,
} from "../services/billing/stripe.js";
import { markInvoicePaid } from "../services/invoices/invoice.js";
import { sendMessage } from "../services/messaging/sender.js";

export const stripeWebhookRouter = Router();

async function applySubscriptionToClient(opts: {
  clientId?: string | null;
  customerId?: string | null;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
  trialEndsAt?: Date | null;
}) {
  const data: {
    status: typeof opts.status;
    stripeCustomerId?: string;
    trialEndsAt?: Date | null;
  } = { status: opts.status };
  if (opts.customerId) data.stripeCustomerId = opts.customerId;
  if (opts.trialEndsAt !== undefined) data.trialEndsAt = opts.trialEndsAt;

  if (opts.clientId) {
    await prisma.client.update({ where: { id: opts.clientId }, data }).catch(() => undefined);
  }
  if (opts.customerId) {
    await prisma.client.updateMany({ where: { stripeCustomerId: opts.customerId }, data });
  }
}

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
  const metadata = (obj.metadata as Record<string, string>) || {};
  const metaClientId = metadata.clientId || undefined;

  // Connect / job payments (invoice Pay Now + quote deposits)
  if (event.type === "checkout.session.completed" && obj.mode === "payment") {
    try {
      const paymentStatus = String(obj.payment_status || "");
      if (paymentStatus === "paid" || paymentStatus === "no_payment_required") {
        if (metadata.type === "invoice" && metadata.invoiceId) {
          const inv = await prisma.invoice.findUnique({ where: { id: metadata.invoiceId } });
          if (inv && inv.status !== "PAID") {
            await markInvoicePaid(inv.clientId, inv.id, {
              paidVia: "stripe",
              stripePaymentIntentId: (obj.payment_intent as string) || null,
            });
            const client = await prisma.client.findUnique({ where: { id: inv.clientId } });
            if (client?.destPhone) {
              void sendMessage({
                to: client.destPhone,
                channel: client.destChannel,
                body: `Payment received for invoice ${inv.reference || ""} via card/Pay Now.`,
              }).catch(() => undefined);
            }
          }
        }
        if (metadata.type === "deposit" && metadata.quoteId) {
          const quote = await prisma.quote.findUnique({
            where: { id: metadata.quoteId },
            include: { client: true },
          });
          if (quote && !quote.depositPaidAt) {
            await prisma.quote.update({
              where: { id: quote.id },
              data: { depositPaidAt: new Date() },
            });
            if (quote.client.destPhone) {
              void sendMessage({
                to: quote.client.destPhone,
                channel: quote.client.destChannel,
                body: `Deposit paid on quote (${quote.depositPence / 100} GBP).`,
              }).catch(() => undefined);
            }
          }
        }
      }
    } catch (e) {
      console.error("[stripe] payment handling failed", e);
    }
    return res.json({ received: true });
  }

  // SaaS subscription checkout completed (£14 starter + trial on £49/mo)
  if (event.type === "checkout.session.completed" && obj.mode === "subscription") {
    try {
      const subId = typeof obj.subscription === "string" ? obj.subscription : "";
      const custId = typeof obj.customer === "string" ? obj.customer : customerId;
      const clientId = clientRef || metaClientId;
      const sub = subId ? await retrieveSubscription(subId) : null;
      const mapped = sub ? mapSubscriptionStatus(sub.status) : "TRIAL";
      if (mapped) {
        await applySubscriptionToClient({
          clientId,
          customerId: custId || sub?.customer || null,
          status: mapped,
          trialEndsAt: sub?.trialEnd ?? new Date(Date.now() + env.TRIAL_DAYS * 24 * 60 * 60 * 1000),
        });
      }
    } catch (e) {
      console.error("[stripe] subscription checkout failed", e);
    }
    return res.json({ received: true });
  }

  // Account updated — mark Connect onboarded when charges enabled
  if (event.type === "account.updated") {
    try {
      const accountId = String(obj.id || "");
      const chargesEnabled = !!obj.charges_enabled;
      if (accountId) {
        await prisma.client.updateMany({
          where: { stripeConnectAccountId: accountId },
          data: { stripeConnectOnboarded: chargesEnabled },
        });
      }
    } catch (e) {
      console.error("[stripe] account.updated failed", e);
    }
    return res.json({ received: true });
  }

  // Subscription lifecycle
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    try {
      const statusRaw = typeof obj.status === "string" ? obj.status : "";
      const mapped = mapSubscriptionStatus(statusRaw);
      if (mapped) {
        const trialEnd =
          typeof obj.trial_end === "number" && obj.trial_end > 0
            ? new Date(obj.trial_end * 1000)
            : mapped === "ACTIVE"
              ? null
              : undefined;
        const subMeta = (obj.metadata as Record<string, string>) || {};
        await applySubscriptionToClient({
          clientId: subMeta.clientId || metaClientId || null,
          customerId: customerId || null,
          status: mapped,
          trialEndsAt: trialEnd,
        });
      }
    } catch (e) {
      console.error("[stripe] subscription update failed", e);
    }
    return res.json({ received: true });
  }

  let status = mapEventToStatus(event.type || "");
  if (status) {
    try {
      await applySubscriptionToClient({
        clientId: clientRef || metaClientId || null,
        customerId: customerId || null,
        status,
      });
    } catch (e) {
      console.error("[stripe] status update failed", e);
    }
  }

  res.json({ received: true });
});
