import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";

/**
 * Replays the original response for a repeated Idempotency-Key.
 *
 * Tradies queue writes on their phone when there's no signal, and the outbox
 * retries until it gets a definite answer. A request that reached the server but
 * whose response died on the way back looks identical to one that never arrived,
 * so without this a voice note recorded in a plant room would build a fresh draft
 * quote on every retry.
 *
 * Only applied to routes the outbox can queue. Requests with no key — anything
 * from the web app — pass straight through, so this changes nothing for them.
 */
export function idempotent(handler: (req: Request, res: Response, next: NextFunction) => void) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = String(req.header("Idempotency-Key") || "").trim();
    const clientId = (req as Request & { clientId?: string }).clientId;

    if (!key || !clientId) return handler(req, res, next);

    try {
      const seen = await prisma.idempotencyKey.findUnique({
        where: { clientId_key: { clientId, key } },
      });
      if (seen) {
        res.status(seen.responseStatus).json(seen.responseBody);
        return;
      }
    } catch (err) {
      // A lookup failure must not block the write — worst case we do the work twice.
      console.warn("[idempotency] lookup failed:", err);
      return handler(req, res, next);
    }

    // Capture whatever the handler sends so it can be replayed verbatim.
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const status = res.statusCode;
      if (status >= 200 && status < 300) {
        void prisma.idempotencyKey
          .create({
            data: {
              key,
              clientId,
              endpoint: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`,
              responseStatus: status,
              // Prisma's Json column rejects undefined; null is the honest stand-in.
              responseBody: (body ?? null) as never,
            },
          })
          .catch((err) => {
            // Losing the record only costs us the dedupe guarantee on a later retry.
            console.warn("[idempotency] could not record key:", err);
          });
      }
      return originalJson(body);
    }) as Response["json"];

    return handler(req, res, next);
  };
}
