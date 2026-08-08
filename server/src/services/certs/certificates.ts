import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/error.js";
import { newPublicToken, appPublicUrl } from "../quotes/magicAuth.js";
import { storeCertFile } from "../storage/store.js";
import { sendMessage } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";
import type { Prisma } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

export const KIND_LABEL: Record<string, string> = {
  GAS_SAFETY: "Gas safety record",
  MINOR_WORKS: "Minor works certificate",
  EICR: "EICR",
  OTHER: "Compliance document",
};

export type CertKind = "GAS_SAFETY" | "MINOR_WORKS" | "EICR" | "OTHER";

function defaultDueAt(issuedAt: Date | null | undefined): Date {
  const base = issuedAt?.getTime() ?? Date.now();
  return new Date(base + 335 * DAY_MS); // ~11 months
}

async function syncServiceReminder(opts: {
  certificateId: string;
  clientId: string;
  enquiryId: string | null;
  serviceDueAt: Date | null;
}) {
  await prisma.followUp.updateMany({
    where: { certificateId: opts.certificateId, kind: "SERVICE_REMINDER", status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (!opts.serviceDueAt) return;
  await prisma.followUp.create({
    data: {
      certificateId: opts.certificateId,
      clientId: opts.clientId,
      enquiryId: opts.enquiryId,
      kind: "SERVICE_REMINDER",
      runAt: opts.serviceDueAt,
      status: "PENDING",
    },
  });
}

async function parseOptionalFile(file?: { contentType: string; dataBase64: string } | null) {
  if (!file?.dataBase64) return null;
  const raw = file.dataBase64.includes(",")
    ? file.dataBase64.slice(file.dataBase64.indexOf(",") + 1)
    : file.dataBase64;
  const buf = Buffer.from(raw, "base64");
  const stored = await storeCertFile(file.contentType, buf);
  return { url: stored.url, contentType: file.contentType.split(";")[0]!.trim().toLowerCase() };
}

export async function createCertificate(opts: {
  clientId: string;
  enquiryId?: string | null;
  kind: CertKind;
  siteAddress?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  issuedAt?: Date | null;
  schemeRef?: string | null;
  notes?: string | null;
  serviceDueAt?: Date | null;
  file?: { contentType: string; dataBase64: string } | null;
}) {
  const stored = await parseOptionalFile(opts.file);
  if (!stored) throw new ApiError(400, "file_required", "Upload a photo or PDF of the certificate");

  let enquiryId: string | null = null;
  if (opts.enquiryId) {
    const enq = await prisma.enquiry.findFirst({
      where: { id: opts.enquiryId, clientId: opts.clientId },
      select: { id: true },
    });
    if (!enq) throw new ApiError(400, "invalid_ref", "Enquiry not found for this account");
    enquiryId = enq.id;
  }

  const issuedAt = opts.issuedAt ?? new Date();
  const serviceDueAt = opts.serviceDueAt ?? defaultDueAt(issuedAt);
  const formData: Record<string, unknown> = {};
  if (opts.notes) formData.notes = opts.notes;

  const row = await prisma.certificate.create({
    data: {
      clientId: opts.clientId,
      enquiryId,
      kind: opts.kind,
      siteAddress: opts.siteAddress || null,
      customerName: opts.customerName || null,
      customerPhone: opts.customerPhone || null,
      customerEmail: opts.customerEmail || null,
      issuedAt,
      schemeRef: opts.schemeRef?.trim() || null,
      formData: formData as Prisma.InputJsonValue,
      pdfUrl: stored.url,
      fileContentType: stored.contentType,
      publicToken: newPublicToken(),
      status: "FILED",
      serviceDueAt,
    },
  });

  await syncServiceReminder({
    certificateId: row.id,
    clientId: opts.clientId,
    enquiryId: row.enquiryId,
    serviceDueAt: row.serviceDueAt,
  });

  return row;
}

export async function updateCertificate(
  clientId: string,
  id: string,
  data: {
    siteAddress?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    issuedAt?: Date | null;
    schemeRef?: string | null;
    notes?: string | null;
    serviceDueAt?: Date | null;
    kind?: CertKind;
    file?: { contentType: string; dataBase64: string } | null;
  }
) {
  const row = await prisma.certificate.findFirst({ where: { id, clientId } });
  if (!row) throw new ApiError(404, "not_found", "Certificate not found");

  const stored = await parseOptionalFile(data.file);
  const nextForm = { ...((row.formData as Record<string, unknown>) || {}) };
  if (data.notes !== undefined) {
    if (data.notes) nextForm.notes = data.notes;
    else delete nextForm.notes;
  }

  const serviceDueAt =
    data.serviceDueAt !== undefined ? data.serviceDueAt : row.serviceDueAt;

  const updated = await prisma.certificate.update({
    where: { id },
    data: {
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.siteAddress !== undefined ? { siteAddress: data.siteAddress } : {}),
      ...(data.customerName !== undefined ? { customerName: data.customerName } : {}),
      ...(data.customerPhone !== undefined ? { customerPhone: data.customerPhone } : {}),
      ...(data.customerEmail !== undefined ? { customerEmail: data.customerEmail } : {}),
      ...(data.issuedAt !== undefined ? { issuedAt: data.issuedAt } : {}),
      ...(data.schemeRef !== undefined ? { schemeRef: data.schemeRef?.trim() || null } : {}),
      ...(data.notes !== undefined ? { formData: nextForm as Prisma.InputJsonValue } : {}),
      ...(data.serviceDueAt !== undefined ? { serviceDueAt: data.serviceDueAt } : {}),
      ...(stored
        ? {
            pdfUrl: stored.url,
            fileContentType: stored.contentType,
            status: row.status === "SENT" ? "SENT" : "FILED",
          }
        : {}),
    },
  });

  if (data.serviceDueAt !== undefined) {
    await syncServiceReminder({
      certificateId: id,
      clientId,
      enquiryId: updated.enquiryId,
      serviceDueAt,
    });
  }

  return updated;
}

/** @deprecated Kept for old clients — filing replaces sign+generate. */
export async function signCertificate(clientId: string, id: string, _signatureDataUrl: string) {
  const row = await prisma.certificate.findFirst({ where: { id, clientId } });
  if (!row) throw new ApiError(404, "not_found", "Certificate not found");
  if (!row.pdfUrl) {
    throw new ApiError(400, "file_required", "Upload a photo or PDF of the certificate instead of signing");
  }
  return prisma.certificate.update({
    where: { id },
    data: { status: row.status === "SENT" ? "SENT" : "FILED", signedAt: new Date() },
  });
}

export async function sendCertificate(clientId: string, id: string) {
  const row = await prisma.certificate.findFirst({
    where: { id, clientId },
    include: { client: true },
  });
  if (!row) throw new ApiError(404, "not_found", "Certificate not found");
  if (!row.pdfUrl) throw new ApiError(400, "file_required", "Upload the certificate file first");
  if (!row.customerPhone) throw new ApiError(400, "no_phone", "No customer phone");

  const label = KIND_LABEL[row.kind] || "certificate";
  const url = `${appPublicUrl()}/cert/${row.publicToken}`;
  const body = `${row.client.businessName}: your ${label} is saved here — ${url}`;
  const results = await sendMessage({ to: row.customerPhone, channel: "SMS", body });
  await logMessage({
    clientId,
    enquiryId: row.enquiryId,
    direction: "OUTBOUND",
    toAddr: row.customerPhone,
    body,
    twilioSid: results[0]?.id,
  });

  return prisma.certificate.update({
    where: { id },
    data: { status: "SENT" },
  });
}
