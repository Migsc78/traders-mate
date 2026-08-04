import type { Prisma } from "@prisma/client";
import { prisma } from "../../db.js";

/**
 * Job history, written as it happens.
 *
 * The customer timeline is derived from quotes, invoices and appointments, and
 * that's right for customers. Job history is different: when you arrived, when
 * the customer approved the extra, when the work was signed off. Those are
 * commercial facts, and a timeline that silently rewrites itself when someone
 * edits an underlying record is worse than no timeline at all if a job is ever
 * disputed. So this is appended, never recomputed.
 */

export type JobEventType =
  | "job.created"
  | "job.scheduled"
  | "job.rescheduled"
  | "visit.on_my_way"
  | "job.started"
  | "job.paused"
  | "job.completed"
  | "job.cancelled"
  | "job.reopened"
  | "cost.added"
  | "cost.extra_agreed"
  | "invoice.created"
  | "invoice.sent"
  | "invoice.paid"
  | "access.revealed"
  | "note.added"
  | "message.sent";

type Client = Prisma.TransactionClient | typeof prisma;

export async function appendJobEvent(
  db: Client,
  input: {
    clientId: string;
    jobId: string;
    type: JobEventType;
    summary: string;
    payload?: Prisma.InputJsonValue;
    actor?: string | null;
  }
): Promise<void> {
  await db.jobEvent.create({
    data: {
      clientId: input.clientId,
      jobId: input.jobId,
      type: input.type,
      summary: input.summary,
      payload: input.payload,
      actor: input.actor ?? null,
    },
  });
}

export async function listJobEvents(clientId: string, jobId: string) {
  return prisma.jobEvent.findMany({
    where: { clientId, jobId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
