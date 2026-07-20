import { prisma } from "../../db.js";
import { ApiError } from "../../middleware/error.js";
import { newPublicToken, appPublicUrl } from "../quotes/magicAuth.js";
import { renderCertificatePdf } from "../docs/pdf.js";
import { sendMessage } from "../messaging/sender.js";
import { logMessage } from "../messaging/log.js";
import type { Prisma } from "@prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;

const KIND_LABEL: Record<string, string> = {
  GAS_SAFETY: "Landlord Gas Safety Record (CP12)",
  MINOR_WORKS: "Minor Electrical Installation Works Certificate",
  EICR: "Electrical Installation Condition Report (EICR)",
};

export async function createCertificate(opts: {
  clientId: string;
  enquiryId?: string | null;
  kind: "GAS_SAFETY" | "MINOR_WORKS" | "EICR";
  siteAddress?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  formData?: Record<string, unknown>;
}) {
  return prisma.certificate.create({
    data: {
      clientId: opts.clientId,
      enquiryId: opts.enquiryId || null,
      kind: opts.kind,
      siteAddress: opts.siteAddress || null,
      customerName: opts.customerName || null,
      customerPhone: opts.customerPhone || null,
      customerEmail: opts.customerEmail || null,
      formData: (opts.formData || {}) as Prisma.InputJsonValue,
      publicToken: newPublicToken(),
      status: "DRAFT",
    },
  });
}

export async function updateCertificate(
  clientId: string,
  id: string,
  data: {
    siteAddress?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    formData?: Record<string, unknown>;
  }
) {
  const row = await prisma.certificate.findFirst({ where: { id, clientId } });
  if (!row) throw new ApiError(404, "not_found", "Certificate not found");
  if (row.status === "SENT") throw new ApiError(400, "locked", "Certificate already sent");
  return prisma.certificate.update({
    where: { id },
    data: {
      ...(data.siteAddress !== undefined ? { siteAddress: data.siteAddress } : {}),
      ...(data.customerName !== undefined ? { customerName: data.customerName } : {}),
      ...(data.customerPhone !== undefined ? { customerPhone: data.customerPhone } : {}),
      ...(data.customerEmail !== undefined ? { customerEmail: data.customerEmail } : {}),
      ...(data.formData !== undefined ? { formData: data.formData as Prisma.InputJsonValue } : {}),
    },
  });
}

export async function signCertificate(clientId: string, id: string, signatureDataUrl: string) {
  const row = await prisma.certificate.findFirst({
    where: { id, clientId },
    include: { client: true },
  });
  if (!row) throw new ApiError(404, "not_found", "Certificate not found");

  const signedAt = new Date();
  const pdf = await renderCertificatePdf({
    kindLabel: KIND_LABEL[row.kind] || row.kind,
    businessName: row.client.businessName,
    siteAddress: row.siteAddress,
    customerName: row.customerName,
    formData: (row.formData as Record<string, unknown>) || {},
    signatureDataUrl,
    signedAt,
  });

  const serviceDueAt = new Date(signedAt.getTime() + 335 * DAY_MS); // ~11 months

  const updated = await prisma.certificate.update({
    where: { id },
    data: {
      status: "SIGNED",
      signatureDataUrl,
      signedAt,
      pdfUrl: pdf.url,
      serviceDueAt,
    },
  });

  // Annual service reminder
  await prisma.followUp.create({
    data: {
      certificateId: id,
      clientId,
      enquiryId: row.enquiryId,
      kind: "SERVICE_REMINDER",
      runAt: serviceDueAt,
      status: "PENDING",
    },
  });

  return updated;
}

export async function sendCertificate(clientId: string, id: string) {
  const row = await prisma.certificate.findFirst({
    where: { id, clientId },
    include: { client: true },
  });
  if (!row) throw new ApiError(404, "not_found", "Certificate not found");
  if (row.status === "DRAFT") throw new ApiError(400, "unsigned", "Sign the certificate first");
  if (!row.customerPhone) throw new ApiError(400, "no_phone", "No customer phone");

  const url = row.pdfUrl || `${appPublicUrl()}/cert/${row.publicToken}`;
  const body = `${row.client.businessName}: your ${KIND_LABEL[row.kind] || "certificate"} is ready — ${url}`;
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

export { KIND_LABEL };
