import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";
import { ApiError } from "./error.js";

/**
 * Protects operator CRM routes when OPERATOR_ADMIN_PASSWORD and/or
 * OPERATOR_API_TOKEN is set. Accepts:
 * - Bearer / x-operator-token == OPERATOR_API_TOKEN (scripts / legacy)
 * - Signed operator session from password login
 */
let warnedOpen = false;

const SESSION_DAYS = 14;

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sessionSigningSecret(): string {
  return (
    env.OPERATOR_API_TOKEN?.trim() ||
    env.OPERATOR_ADMIN_PASSWORD?.trim() ||
    env.MAGIC_LINK_SECRET
  );
}

export function readOperatorToken(req: Request): string {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const alt = String(req.headers["x-operator-token"] || "").trim();
  return bearer || alt;
}

export function operatorAuthConfigured(): boolean {
  return !!(env.OPERATOR_ADMIN_PASSWORD?.trim() || env.OPERATOR_API_TOKEN?.trim());
}

/** Password accepted at /admin/login — prefer dedicated admin password. */
export function operatorLoginPassword(): string {
  return env.OPERATOR_ADMIN_PASSWORD?.trim() || env.OPERATOR_API_TOKEN?.trim() || "";
}

export function issueOperatorSession(): { sessionToken: string; expiresAt: string } {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const nonce = randomBytes(16).toString("base64url");
  const body = `op.v1.${exp}.${nonce}`;
  const sig = createHmac("sha256", sessionSigningSecret()).update(body).digest("base64url");
  return {
    sessionToken: `${body}.${sig}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function verifyOperatorSession(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "op" || parts[1] !== "v1") return false;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const body = parts.slice(0, 4).join(".");
  const providedSig = parts[4] || "";
  const expectedSig = createHmac("sha256", sessionSigningSecret()).update(body).digest("base64url");
  try {
    return tokensMatch(providedSig, expectedSig);
  } catch {
    return false;
  }
}

export function verifyLoginPassword(password: string): boolean {
  const expected = operatorLoginPassword();
  if (!expected || !password) return false;
  return tokensMatch(password, expected);
}

export function isValidOperatorCredential(provided: string): boolean {
  if (!provided) return false;
  const apiToken = env.OPERATOR_API_TOKEN?.trim();
  if (apiToken && tokensMatch(provided, apiToken)) return true;
  return verifyOperatorSession(provided);
}

export function requireOperator(req: Request, _res: Response, next: NextFunction) {
  if (!operatorAuthConfigured()) {
    if (!warnedOpen && process.env.NODE_ENV === "production") {
      console.warn(
        "[auth] OPERATOR_ADMIN_PASSWORD / OPERATOR_API_TOKEN not set — CRM API is open. Set OPERATOR_ADMIN_PASSWORD in production."
      );
      warnedOpen = true;
    }
    return next();
  }

  const provided = readOperatorToken(req);
  if (!provided || !isValidOperatorCredential(provided)) {
    return next(new ApiError(401, "unauthorized", "Operator authentication required"));
  }
  next();
}
