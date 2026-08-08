import { Router } from "express";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import {
  resolveUploadPath,
  verifySignedFileRequest,
} from "../services/storage/signedUrls.js";

export const filesRouter = Router();

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

/**
 * GET /api/files/<key>?exp=&sig=
 * Streams a private upload after HMAC verification.
 */
filesRouter.get(/.*/, (req, res) => {
  try {
    const key = decodeURIComponent((req.path || "").replace(/^\/+/, ""));
    const exp = String(req.query.exp || "");
    const sig = String(req.query.sig || "");

    if (!key || !verifySignedFileRequest(key, exp, sig)) {
      res.status(401).json({ error: { code: "unauthorized", message: "Invalid or expired file link" } });
      return;
    }

    const full = resolveUploadPath(key);
    if (!existsSync(full)) {
      res.status(404).json({ error: { code: "not_found", message: "File not found" } });
      return;
    }

    const ext = path.extname(full).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.setHeader("X-Content-Type-Options", "nosniff");
    createReadStream(full).pipe(res);
  } catch {
    res.status(400).json({ error: { code: "bad_request", message: "Bad file request" } });
  }
});
