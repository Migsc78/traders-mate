import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../env.js";
import { endSse, initSse, sendSse, startSseHeartbeat } from "../lib/sse.js";
import { PlacesError } from "../services/places.js";
import { runSearch } from "../services/pipeline.js";
import { ApiError } from "../middleware/error.js";

export const searchRouter = Router();

const limiter = rateLimit({
  windowMs: env.SEARCH_RATE_WINDOW_MS,
  max: env.SEARCH_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many searches, slow down." } },
});

const bodySchema = z
  .object({
    occupation: z.string().min(2).max(80),
    town: z.string().min(1).max(80).optional(),
    center: z.object({ lat: z.number(), lng: z.number() }).optional(),
    radiusM: z.number().int().min(500).max(50000).optional(),
    maxResults: z.number().int().min(1).max(120).default(40),
    mode: z.enum(["SITE_BUILD", "SAAS_BETA"]).default("SAAS_BETA"),
  })
  .refine((d) => d.town || (d.center && d.radiusM), {
    message: "Provide either a town, or a center + radiusM",
  });

searchRouter.post("/", limiter, async (req, res, next) => {
  try {
    const params = bodySchema.parse(req.body);
    const summary = await runSearch(params);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

searchRouter.post("/stream", limiter, async (req, res, next) => {
  let stopHeartbeat: (() => void) | undefined;
  try {
    const params = bodySchema.parse(req.body);
    initSse(res);
    stopHeartbeat = startSseHeartbeat(res);

    const summary = await runSearch(params, (progress) => sendSse(res, "progress", progress));
    sendSse(res, "complete", summary);
    endSse(res);
  } catch (err) {
    if (res.headersSent) {
      const message =
        err instanceof PlacesError || err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.name === "TimeoutError" || err.message.includes("aborted")
              ? "Google Places timed out — try fewer results or retry."
              : err.message
            : "Search failed";
      try {
        sendSse(res, "error", { message });
        endSse(res);
      } catch {
        /* client already gone */
      }
      return;
    }
    next(err);
  } finally {
    stopHeartbeat?.();
  }
});
