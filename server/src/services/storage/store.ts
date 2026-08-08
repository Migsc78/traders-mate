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
  "application/pdf": "pdf",
};

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB per photo
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 MB voice notes
export const MAX_CERT_FILE_BYTES = 12 * 1024 * 1024; // 12 MB cert photo/PDF

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

/** 16 random bytes → ~128 bits of filename entropy (unguessable). */
function randomFileName(ext: string): string {
  return `${Date.now()}-${randomBytes(16).toString("hex")}.${ext}`;
}

/** Best-effort magic-byte check so clients cannot rename HTML/JS as images. */
export function assertImageMagic(contentType: string, data: Buffer): void {
  const mime = contentType.toLowerCase().split(";")[0]!.trim();
  if (mime === "image/heic") return; // variable container; skip strict check
  if (mime === "image/jpeg" || mime === "image/jpg") {
    if (data.length < 3 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
      throw new Error("Image bytes do not match JPEG content type");
    }
    return;
  }
  if (mime === "image/png") {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (data.length < 8 || !data.subarray(0, 8).equals(sig)) {
      throw new Error("Image bytes do not match PNG content type");
    }
    return;
  }
  if (mime === "image/webp") {
    if (
      data.length < 12 ||
      data.toString("ascii", 0, 4) !== "RIFF" ||
      data.toString("ascii", 8, 12) !== "WEBP"
    ) {
      throw new Error("Image bytes do not match WebP content type");
    }
  }
}

export function assertPdfMagic(data: Buffer): void {
  if (data.length < 5 || data.toString("ascii", 0, 5) !== "%PDF-") {
    throw new Error("File bytes do not match PDF content type");
  }
}

/**
 * Local storage impl: writes to /uploads and returns a public URL.
 * Swap this for S3/R2 later by keeping the same signature.
 */
export async function storeImage(contentType: string, data: Buffer): Promise<StoredFile> {
  const ext = EXT[contentType.toLowerCase()];
  if (!ext || ext === "pdf") throw new Error("Unsupported image type");
  if (data.length > MAX_UPLOAD_BYTES) throw new Error("Image too large");
  assertImageMagic(contentType, data);

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const name = randomFileName(ext);
  const full = path.join(UPLOADS_DIR, name);
  await fs.writeFile(full, data);
  return { url: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/uploads/${name}`, path: full };
}

/** Photo or PDF of a real safety/compliance certificate. */
export async function storeCertFile(contentType: string, data: Buffer): Promise<StoredFile> {
  const mime = contentType.toLowerCase().split(";")[0]!.trim();
  const ext = EXT[mime];
  if (!ext) throw new Error("Unsupported file type — use a photo (JPEG/PNG/WebP) or PDF");
  if (data.length > MAX_CERT_FILE_BYTES) throw new Error("File too large (max 12 MB)");
  if (ext === "pdf") assertPdfMagic(data);
  else assertImageMagic(mime, data);

  await fs.mkdir(path.join(UPLOADS_DIR, "certs"), { recursive: true });
  const name = randomFileName(ext);
  const full = path.join(UPLOADS_DIR, "certs", name);
  await fs.writeFile(full, data);
  return { url: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/uploads/certs/${name}`, path: full };
}

export async function storeAudio(contentType: string, data: Buffer): Promise<StoredFile> {
  const ext = AUDIO_EXT[contentType.toLowerCase()] || "webm";
  if (data.length > MAX_AUDIO_BYTES) throw new Error("Audio too large");
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const name = randomFileName(ext);
  const full = path.join(UPLOADS_DIR, name);
  await fs.writeFile(full, data);
  return { url: `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/uploads/${name}`, path: full };
}
