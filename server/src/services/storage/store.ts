import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { env } from "../../env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = path.resolve(__dirname, "../../../uploads");

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB per photo
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 MB voice notes

const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
};

export interface StoredFile {
  url: string;
  path?: string;
}

/**
 * Local storage impl: writes to /uploads and returns a public URL.
 * Swap this for S3/R2 later by keeping the same signature.
 */
export async function storeImage(contentType: string, data: Buffer): Promise<StoredFile> {
  const ext = EXT[contentType.toLowerCase()];
  if (!ext) throw new Error("Unsupported image type");
  if (data.length > MAX_UPLOAD_BYTES) throw new Error("Image too large");

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const name = `${Date.now()}-${randomBytes(5).toString("hex")}.${ext}`;
  const full = path.join(UPLOADS_DIR, name);
  await fs.writeFile(full, data);
  return { url: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/uploads/${name}`, path: full };
}

export async function storeAudio(contentType: string, data: Buffer): Promise<StoredFile> {
  const ext = AUDIO_EXT[contentType.toLowerCase()] || "webm";
  if (data.length > MAX_AUDIO_BYTES) throw new Error("Audio too large");
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const name = `${Date.now()}-${randomBytes(5).toString("hex")}.${ext}`;
  const full = path.join(UPLOADS_DIR, name);
  await fs.writeFile(full, data);
  return { url: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/uploads/${name}`, path: full };
}
