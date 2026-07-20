import PDFDocument from "pdfkit";
import { promises as fs } from "node:fs";
import path from "node:path";
import { UPLOADS_DIR } from "../storage/store.js";
import { formatGbp } from "../quotes/money.js";
import { env } from "../../env.js";

export type PdfLine = {
  label: string;
  qty: number;
  unitPricePence: number;
};

export type DocPdfInput = {
  kind: "quote" | "invoice";
  businessName: string;
  vatNumber?: string | null;
  customerName?: string | null;
  reference?: string | null;
  lines: PdfLine[];
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  amountDuePence?: number;
  depositAppliedPence?: number;
  bankName?: string | null;
  bankSortCode?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  note?: string | null;
  logoUrl?: string | null;
  dueDate?: Date | null;
};

async function tryLoadLogo(logoUrl: string | null | undefined): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    if (logoUrl.startsWith("http")) {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    const local = logoUrl.replace(/^\/uploads\//, "");
    const full = path.join(UPLOADS_DIR, local);
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

/** Render a simple branded PDF and store under /uploads/pdfs/. Returns public URL path. */
export async function renderMoneyPdf(input: DocPdfInput): Promise<{ url: string; path: string }> {
  await fs.mkdir(path.join(UPLOADS_DIR, "pdfs"), { recursive: true });
  const filename = `${input.kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const fullPath = path.join(UPLOADS_DIR, "pdfs", filename);

  const logo = await tryLoadLogo(input.logoUrl);
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (logo) {
    try {
      doc.image(logo, 48, 40, { fit: [80, 80] });
    } catch {
      /* ignore bad image */
    }
  }

  doc.fontSize(18).fillColor("#0f172a").text(input.businessName, logo ? 140 : 48, 48);
  doc.fontSize(11).fillColor("#64748b").text(input.kind === "quote" ? "Quote" : "Invoice", { align: "right" });
  if (input.vatNumber) doc.text(`VAT: ${input.vatNumber}`, { align: "right" });
  if (input.reference) doc.text(`Ref: ${input.reference}`, { align: "right" });
  if (input.customerName) {
    doc.moveDown();
    doc.fillColor("#0f172a").fontSize(12).text(`For: ${input.customerName}`);
  }
  if (input.dueDate) {
    doc.fontSize(11).fillColor("#64748b").text(`Due: ${input.dueDate.toLocaleDateString("en-GB")}`);
  }

  doc.moveDown();
  doc.fillColor("#0f172a").fontSize(11);
  doc.text("Item", 48, doc.y, { continued: true, width: 260 });
  doc.text("Qty", 310, doc.y, { continued: true, width: 50 });
  doc.text("Amount", 380, doc.y, { align: "right", width: 140 });
  doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).stroke("#e2e8f0");
  doc.moveDown(0.6);

  for (const line of input.lines) {
    const amount = Math.round(line.qty * line.unitPricePence);
    const y = doc.y;
    doc.text(line.label.slice(0, 60), 48, y, { width: 250 });
    doc.text(String(line.qty), 310, y, { width: 50 });
    doc.text(formatGbp(amount), 380, y, { align: "right", width: 140 });
    doc.moveDown(0.4);
  }

  doc.moveDown();
  doc.text(`Subtotal: ${formatGbp(input.subtotalPence)}`, { align: "right" });
  doc.text(`VAT: ${formatGbp(input.vatPence)}`, { align: "right" });
  doc.fontSize(13).text(`Total: ${formatGbp(input.totalPence)}`, { align: "right" });
  if (input.depositAppliedPence && input.depositAppliedPence > 0) {
    doc.fontSize(11).text(`Deposit paid: −${formatGbp(input.depositAppliedPence)}`, { align: "right" });
    doc.fontSize(13).text(`Amount due: ${formatGbp(input.amountDuePence ?? input.totalPence)}`, { align: "right" });
  }

  if (input.bankAccountNumber || input.bankSortCode) {
    doc.moveDown();
    doc.fontSize(12).fillColor("#0f172a").text("Pay by bank transfer");
    doc.fontSize(11).fillColor("#334155");
    if (input.bankAccountName) doc.text(`Account name: ${input.bankAccountName}`);
    if (input.bankSortCode) doc.text(`Sort code: ${input.bankSortCode}`);
    if (input.bankAccountNumber) doc.text(`Account number: ${input.bankAccountNumber}`);
    if (input.reference) doc.text(`Reference: ${input.reference}`);
  }

  if (input.note) {
    doc.moveDown();
    doc.fontSize(10).fillColor("#64748b").text(input.note, { width: 480 });
  }

  doc.end();
  const buf = await done;
  await fs.writeFile(fullPath, buf);

  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return { url: `${base}/uploads/pdfs/${filename}`, path: fullPath };
}

export type CertPdfInput = {
  kindLabel: string;
  businessName: string;
  siteAddress?: string | null;
  customerName?: string | null;
  formData: Record<string, unknown>;
  signatureDataUrl?: string | null;
  signedAt?: Date | null;
};

export async function renderCertificatePdf(input: CertPdfInput): Promise<{ url: string }> {
  await fs.mkdir(path.join(UPLOADS_DIR, "pdfs"), { recursive: true });
  const filename = `cert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const fullPath = path.join(UPLOADS_DIR, "pdfs", filename);

  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(18).text(input.kindLabel);
  doc.fontSize(12).fillColor("#64748b").text(input.businessName);
  doc.moveDown();
  doc.fillColor("#0f172a");
  if (input.customerName) doc.text(`Customer: ${input.customerName}`);
  if (input.siteAddress) doc.text(`Site: ${input.siteAddress}`);
  if (input.signedAt) doc.text(`Signed: ${input.signedAt.toLocaleString("en-GB")}`);
  doc.moveDown();
  doc.fontSize(11);
  for (const [k, v] of Object.entries(input.formData || {})) {
    if (v == null || v === "") continue;
    doc.text(`${k}: ${String(v)}`);
  }

  if (input.signatureDataUrl?.startsWith("data:image")) {
    try {
      const b64 = input.signatureDataUrl.split(",")[1] || "";
      const img = Buffer.from(b64, "base64");
      doc.moveDown();
      doc.text("Signature:");
      doc.image(img, { fit: [220, 80] });
    } catch {
      /* ignore */
    }
  }

  doc.end();
  const buf = await done;
  await fs.writeFile(fullPath, buf);
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
  return { url: `${base}/uploads/pdfs/${filename}` };
}
