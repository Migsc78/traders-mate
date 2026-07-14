import { Router } from "express";
import cors from "cors";
import { z } from "zod";
import { storeImage } from "../services/storage/store.js";

// Public photo upload used by the site/widget quote forms.
export const uploadRouter = Router();
uploadRouter.use(cors());

const schema = z.object({
  contentType: z.string().min(3).max(40),
  dataBase64: z.string().min(10),
});

uploadRouter.post("/", async (req, res, next) => {
  try {
    const { contentType, dataBase64 } = schema.parse(req.body ?? {});
    const b64 = dataBase64.includes(",") ? dataBase64.slice(dataBase64.indexOf(",") + 1) : dataBase64;
    const buf = Buffer.from(b64, "base64");
    const stored = await storeImage(contentType, buf);
    res.json(stored);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    if (/Unsupported|too large/.test(msg)) return res.status(400).json({ error: { code: "bad_upload", message: msg } });
    next(err);
  }
});
