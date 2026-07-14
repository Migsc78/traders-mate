import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { PlacesError } from "../services/places.js";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "validation_error", message: "Invalid request", details: err.flatten() },
    });
  }
  if (err instanceof PlacesError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P1001") ||
    (err instanceof Error && err.message.includes("Can't reach database server"))
  ) {
    console.error("[error]", err instanceof Error ? err.message : err);
    return res.status(503).json({
      error: {
        code: "database_unavailable",
        message: "Database is not reachable. Start PostgreSQL and run `npm run db:migrate` from traders-mate-app/.",
      },
    });
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  // Never leak the API key
  const safe = message.replace(/key=[^&\s]+/gi, "key=***");
  console.error("[error]", safe);
  return res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
}
