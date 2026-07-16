import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";
import { ApiError } from "./error.js";

/**
 * Protects operator CRM routes. When OPERATOR_API_TOKEN is set, require
 * Authorization: Bearer <token> or x-operator-token header.
 * When unset (local default), allow through with a warning once.
 */
let warnedOpen = false;

export function requireOperator(req: Request, _res: Response, next: NextFunction) {
  const expected = env.OPERATOR_API_TOKEN?.trim();
  if (!expected) {
    if (!warnedOpen && process.env.NODE_ENV === "production") {
      console.warn("[auth] OPERATOR_API_TOKEN is not set — CRM API is open. Set it in production.");
      warnedOpen = true;
    }
    return next();
  }

  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const alt = String(req.headers["x-operator-token"] || "").trim();
  const provided = bearer || alt;

  if (!provided || provided !== expected) {
    return next(new ApiError(401, "unauthorized", "Operator authentication required"));
  }
  next();
}
