import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { isPrivateStorageKey, publicBase, signFileUrl } from "./signedUrls.js";
import { UPLOADS_DIR } from "./paths.js";

export { UPLOADS_DIR } from "./paths.js";

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
  /** Relative key under uploads/ — persist this (or the permanent public URL) in DB. */
  key: string;
  /**
   * Ready-to-fetch URL for the caller.
   * Public objects: permanent `/uploads/...`.
   * Private objects: short-lived signed `/api/files/...` (DB should store `key` or `/uploads/${key}`).
   */
  url: string;
  /** Canonical value to persist — always `/uploads/${key}` (not a signed URL). */
  storedUrl: string;
  path?: string;
}

/** 16 random bytes → ~128 bits of filename entropy (unguessable). */
function randomFileName(ext: string): string {
  return `${Date.now()}-${randomBytes(16).toString("hex")}.${ext}`;
}

function persistedUrl(key: string): string {
  return `${publicBase()}/uploads/${key}`;
}

function accessUrlForKey(key: string): string {
  if (isPrivateStorageKey(key)) return signFileUrl(key);
  return persistedUrl(key);
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

async function writeUnder(subdir: string, name: string, data: Buffer): Promise<{ key: string; full: string }> {
  const dir = subdir ? path.join(UPLOADS_DIR, subdir) : UPLOADS_DIR;
  await fs.mkdir(dir, { recursive: true });
  const full = path.join(dir, name);
  await fs.writeFile(full, data);
  const key = subdir ? `${subdir.replace(/\/$/, "")}/${name}` : name;
  return { key, full };
}

/**
 * Public image (intake/widget/logo) — permanent /uploads URL, statically served.
 */
export async function storeImage(contentType: string, data: Buffer): Promise<StoredFile> {
  const ext = EXT[contentType.toLowerCase()];
  if (!ext || ext === "pdf") throw new Error("Unsupported image type");
  if (data.length > MAX_UPLOAD_BYTES) throw new Error("Image too large");
  assertImageMagic(contentType, data);

  const { key, full } = await writeUnder("", randomFileName(ext), data);
  const storedUrl = persistedUrl(key);
  return { key, storedUrl, url: storedUrl, path: full };
}

/** Photo or PDF of a certificate / customer file — private, signed access only. */
export async function storeCertFile(contentType: string, data: Buffer): Promise<StoredFile> {
  const mime = contentType.toLowerCase().split(";")[0]!.trim();
  const ext = EXT[mime];
  if (!ext) throw new Error("Unsupported file type — use a photo (JPEG/PNG/WebP) or PDF");
  if (data.length > MAX_CERT_FILE_BYTES) throw new Error("File too large (max 12 MB)");
  if (ext === "pdf") assertPdfMagic(data);
  else assertImageMagic(mime, data);

  const { key, full } = await writeUnder("private/certs", randomFileName(ext), data);
  const storedUrl = persistedUrl(key);
  return { key, storedUrl, url: accessUrlForKey(key), path: full };
}

/** Voice notes / greetings-on-disk — private. */
export async function storeAudio(contentType: string, data: Buffer): Promise<StoredFile> {
  const ext = AUDIO_EXT[contentType.toLowerCase()] || "webm";
  if (data.length > MAX_AUDIO_BYTES) throw new Error("Audio too large");

  const { key, full } = await writeUnder("private/audio", randomFileName(ext), data);
  const storedUrl = persistedUrl(key);
  return { key, storedUrl, url: accessUrlForKey(key), path: full };
}

/** Quote/invoice PDFs — private; public pages mint signed links at render time. */
export async function storePrivatePdf(filename: string, data: Buffer): Promise<StoredFile> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const { key, full } = await writeUnder("private/pdfs", safe, data);
  const storedUrl = persistedUrl(key);
  return { key, storedUrl, url: accessUrlForKey(key), path: full };
}
