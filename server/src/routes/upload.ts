import { Router } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { storeImage } from "../services/storage/store.js";

// Public photo upload used by the site/widget quote forms.
export const uploadRouter = Router();
uploadRouter.use(cors());

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many uploads — try again later." } },
});

const schema = z.object({
  contentType: z.string().min(3).max(40),
  dataBase64: z.string().min(10).max(12_000_000),
});

uploadRouter.post("/", uploadLimiter, async (req, res, next) => {
  try {
    const { contentType, dataBase64 } = schema.parse(req.body ?? {});
    const b64 = dataBase64.includes(",") ? dataBase64.slice(dataBase64.indexOf(",") + 1) : dataBase64;
    const buf = Buffer.from(b64, "base64");
    const stored = await storeImage(contentType, buf);
    res.json(stored);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    if (/Unsupported|too large|does not match/.test(msg)) {
      return res.status(400).json({ error: { code: "bad_upload", message: msg } });
    }
    next(err);
  }
});
