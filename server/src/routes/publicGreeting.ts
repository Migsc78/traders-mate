import { Router } from "express";
import { prisma } from "../db.js";

/**
 * Public greeting audio for Twilio <Play> and the tradie Settings preview.
 * Bytes live in Postgres so they survive Railway redeploys (disk /uploads does not).
 */
export const publicGreetingRouter = Router();

publicGreetingRouter.get("/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token || token.length < 8) {
      res.status(404).end();
      return;
    }

    const row = await prisma.client.findFirst({
      where: { greetingPlayToken: token },
      select: { greetingAudioData: true, greetingAudioMime: true },
    });

    if (!row?.greetingAudioData || row.greetingAudioData.length < 100) {
      res.status(404).end();
      return;
    }

    const mime = row.greetingAudioMime?.trim() || "audio/wav";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Content-Length", String(row.greetingAudioData.length));
    res.status(200).send(Buffer.from(row.greetingAudioData));
  } catch (e) {
    console.error("[public greeting]", e);
    res.status(500).end();
  }
});
