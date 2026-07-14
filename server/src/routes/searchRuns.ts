import { Router } from "express";
import { prisma } from "../db.js";

export const searchRunsRouter = Router();

searchRunsRouter.get("/", async (_req, res, next) => {
  try {
    const runs = await prisma.searchRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(runs);
  } catch (err) {
    next(err);
  }
});
