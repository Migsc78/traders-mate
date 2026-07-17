import { Router } from "express";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { formatGbp } from "../services/quotes/money.js";
import { sendMessage } from "../services/messaging/sender.js";
import { logMessage } from "../services/messaging/log.js";

export const invoicePublicRouter = Router();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

invoicePublicRouter.get("/:token", async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken: req.params.token },
      include: {
        lines: { orderBy: { sort: "asc" } },
        client: true,
      },
    });
    if (!invoice || invoice.status === "VOID") throw new ApiError(404, "not_found", "Invoice not found");

    const wantsJson = (req.headers.accept || "").includes("application/json") || req.query.format === "json";
    if (wantsJson) {
      return res.json({
        status: invoice.status,
        businessName: invoice.client.businessName,
        customerName: invoice.customerName,
        reference: invoice.reference,
        lines: invoice.lines,
        subtotalPence: invoice.subtotalPence,
        vatPence: invoice.vatPence,
        totalPence: invoice.totalPence,
        dueDate: invoice.dueDate,
        bankName: invoice.bankName,
        bankSortCode: invoice.bankSortCode,
        bankAccountName: invoice.bankAccountName,
        bankAccountNumber: invoice.bankAccountNumber,
      });
    }

    const linesHtml = invoice.lines
      .map(
        (l) =>
          `<tr><td>${esc(l.label)}</td><td>${l.qty}</td><td>${esc(formatGbp(Math.round(l.qty * l.unitPricePence)))}</td></tr>`
      )
      .join("");

    const bankBlock =
      invoice.bankAccountNumber || invoice.bankSortCode
        ? `<div class="bank">
            <h2>Pay by bank transfer</h2>
            ${invoice.bankAccountName ? `<div><span>Account name</span><strong>${esc(invoice.bankAccountName)}</strong></div>` : ""}
            ${invoice.bankSortCode ? `<div><span>Sort code</span><strong>${esc(invoice.bankSortCode)}</strong></div>` : ""}
            ${invoice.bankAccountNumber ? `<div><span>Account number</span><strong>${esc(invoice.bankAccountNumber)}</strong></div>` : ""}
            ${invoice.reference ? `<div><span>Reference</span><strong>${esc(invoice.reference)}</strong></div>` : ""}
          </div>`
        : `<p class="note">Bank details will be provided by ${esc(invoice.client.businessName)}.</p>`;

    const actions =
      invoice.status === "SENT" || invoice.status === "OVERDUE"
        ? `<form method="POST" action="/i/${esc(invoice.publicToken)}/paid"><button type="submit" class="ok">I've paid</button></form>`
        : `<p class="status">Status: <strong>${esc(invoice.status)}</strong></p>`;

    res.type("html").send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Invoice — ${esc(invoice.client.businessName)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;color:#0f172a;background:#f8fafc}
h1{font-size:1.35rem;margin:0 0 4px} .sub{color:#64748b;margin:0 0 20px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:14px}
th{background:#f1f5f9;font-size:12px;text-transform:uppercase;color:#64748b}
.totals,.bank{margin-top:14px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px}
.totals div,.bank div{display:flex;justify-content:space-between;margin:4px 0}
.total{font-weight:700;font-size:1.1rem}
.ok{background:#15803d;color:#fff;border:none;padding:12px 18px;border-radius:10px;font-weight:700;cursor:pointer}
.note{color:#475569;font-size:14px}
</style></head><body>
<h1>Invoice from ${esc(invoice.client.businessName)}</h1>
${invoice.client.vatNumber ? `<p class="sub">VAT: ${esc(invoice.client.vatNumber)}</p>` : ""}
<p class="sub">${invoice.customerName ? `For ${esc(invoice.customerName)}` : ""}${invoice.reference ? ` · ${esc(invoice.reference)}` : ""}</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${linesHtml}</tbody></table>
<div class="totals">
  <div><span>Subtotal</span><span>${esc(formatGbp(invoice.subtotalPence))}</span></div>
  <div><span>VAT</span><span>${esc(formatGbp(invoice.vatPence))}</span></div>
  <div class="total"><span>Total</span><span>${esc(formatGbp(invoice.totalPence))}</span></div>
  ${invoice.dueDate ? `<div><span>Due</span><span>${esc(new Date(invoice.dueDate).toLocaleDateString("en-GB"))}</span></div>` : ""}
</div>
${bankBlock}
<div style="margin-top:20px">${actions}</div>
</body></html>`);
  } catch (err) {
    next(err);
  }
});

invoicePublicRouter.post("/:token/paid", async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken: req.params.token },
      include: { client: true },
    });
    if (!invoice || invoice.status === "VOID") throw new ApiError(404, "not_found", "Invoice not found");
    if (invoice.status === "PAID") {
      return res.type("html").send(`<!doctype html><meta charset=utf-8><p style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">Already marked paid. Thanks!</p>`);
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paidReportedAt: new Date(), status: invoice.status === "DRAFT" ? "SENT" : invoice.status },
    });

    if (invoice.client.destPhone) {
      const msg = `${invoice.customerName || "Customer"} says they've paid invoice ${invoice.reference || ""} (${formatGbp(invoice.totalPence)}). Confirm in the app.`;
      try {
        const results = await sendMessage({ to: invoice.client.destPhone, channel: invoice.client.destChannel, body: msg });
        await logMessage({
          clientId: invoice.clientId,
          enquiryId: invoice.enquiryId,
          direction: "OUTBOUND",
          toAddr: invoice.client.destPhone,
          body: msg,
          twilioSid: results[0]?.id,
        });
      } catch {
        /* non-fatal */
      }
    }

    if ((req.headers.accept || "").includes("application/json")) return res.json({ ok: true });
    res.type("html").send(`<!doctype html><meta charset=utf-8><p style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">Thanks — we've told ${esc(invoice.client.businessName)} you've paid.</p>`);
  } catch (err) {
    next(err);
  }
});
