import { Router } from "express";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { createCheckoutSession } from "../services/billing/stripe.js";

// Internal: start a subscription checkout for a client.
export const billingRouter = Router();

billingRouter.post("/checkout/:clientId", async (req, res, next) => {
  try {
    const client = await prisma.client.findUnique({ where: { id: req.params.clientId } });
    if (!client) throw new ApiError(404, "not_found", "Client not found");
    const session = await createCheckoutSession({ clientId: client.id });
    res.json(session);
  } catch (err) {
    next(err);
  }
});
