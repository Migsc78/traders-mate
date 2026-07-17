import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { approveEarlyAccessRequest } from "./signup.js";

export const earlyAccessRouter = Router();

earlyAccessRouter.get("/", async (_req, res, next) => {
  try {
    const status = typeof _req.query.status === "string" ? _req.query.status : undefined;
    const where =
      status && ["PENDING", "APPROVED", "DENIED"].includes(status)
        ? { status: status as "PENDING" | "APPROVED" | "DENIED" }
        : {};
    const rows = await prisma.earlyAccessRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

earlyAccessRouter.post("/:id/approve", async (req, res, next) => {
  try {
    const result = await approveEarlyAccessRequest(req.params.id);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

earlyAccessRouter.post("/:id/deny", async (req, res, next) => {
  try {
    z.object({}).parse(req.body ?? {});
    const row = await prisma.earlyAccessRequest.findUnique({ where: { id: req.params.id } });
    if (!row) throw new ApiError(404, "not_found", "Request not found");
    const updated = await prisma.earlyAccessRequest.update({
      where: { id: row.id },
      data: {
        status: "DENIED",
        reviewedAt: new Date(),
        inviteTokenHash: null,
        inviteExpiresAt: null,
        inviteSentAt: null,
      },
    });
    res.json({ ok: true, id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
});
