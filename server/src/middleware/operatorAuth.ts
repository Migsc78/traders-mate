import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../env.js";
import { ApiError } from "./error.js";

/**
 * Protects operator CRM routes. When OPERATOR_API_TOKEN is set, require
 * Authorization: Bearer <token> or x-operator-token header.
 * When unset (local default), allow through with a warning once.
 */
let warnedOpen = false;

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function readOperatorToken(req: Request): string {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const alt = String(req.headers["x-operator-token"] || "").trim();
  return bearer || alt;
}

export function operatorAuthConfigured(): boolean {
  return !!env.OPERATOR_API_TOKEN?.trim();
}

export function requireOperator(req: Request, _res: Response, next: NextFunction) {
  const expected = env.OPERATOR_API_TOKEN?.trim();
  if (!expected) {
    if (!warnedOpen && process.env.NODE_ENV === "production") {
      console.warn("[auth] OPERATOR_API_TOKEN is not set — CRM API is open. Set it in production.");
      warnedOpen = true;
    }
    return next();
  }

  const provided = readOperatorToken(req);
  if (!provided || !tokensMatch(provided, expected)) {
    return next(new ApiError(401, "unauthorized", "Operator authentication required"));
  }
  next();
}
