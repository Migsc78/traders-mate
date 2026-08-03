import { Router } from "express";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { formatGbp } from "../services/quotes/money.js";
import { sendMessage } from "../services/messaging/sender.js";
import { logMessage } from "../services/messaging/log.js";
import { createInvoicePayLink } from "../services/invoices/invoice.js";

export const invoicePublicRouter = Router();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function logoUrlForClient(clientId: string): Promise<string | null> {
  const logo = await prisma.clientAsset.findFirst({
    where: { clientId, kind: "LOGO" },
    orderBy: { createdAt: "desc" },
  });
  return logo?.url ?? null;
}

const DOC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap');
:root{--ink:#0b1f3a;--muted:#5b6b7c;--line:#d7dee8;--paper:#fff;--bg:#e8edf3;--accent:#ff5a1f;--ok:#15803d;--pay:#1d4ed8}
*{box-sizing:border-box}
body{margin:0;font-family:"DM Sans",system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.45}
.page{max-width:720px;margin:28px auto;padding:0 14px 40px}
.doc{background:var(--paper);border:1px solid var(--line);border-radius:4px;box-shadow:0 18px 50px rgba(11,31,58,.08);overflow:hidden}
.doc-inner{padding:28px 28px 32px;border-top:4px solid var(--accent)}
@media(min-width:640px){.doc-inner{padding:40px 44px 44px}}
.letterhead{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:22px}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.brand img{width:72px;height:72px;object-fit:contain;border-radius:10px;background:#f4f7fb;border:1px solid var(--line);flex:none}
.brand-text h1{font-family:Fraunces,Georgia,serif;font-size:1.45rem;font-weight:700;margin:0 0 4px;letter-spacing:-.02em}
.brand-text .trade{margin:0;color:var(--muted);font-size:.92rem}
.meta{text-align:right;font-size:.84rem;color:var(--muted);flex:none}
.meta strong{display:block;color:var(--ink);font-size:.95rem;margin-bottom:4px}
.party{display:grid;gap:8px;margin-bottom:22px}
@media(min-width:560px){.party{grid-template-columns:1fr 1fr;gap:18px}}
.party .box{background:#f7f9fc;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.party .label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin:6px 0 18px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:.92rem}
th{background:#0b1f3a;color:#fff;font-size:.72rem;letter-spacing:.07em;text-transform:uppercase;font-weight:600}
td:last-child,th:last-child{text-align:right;white-space:nowrap}
tr:last-child td{border-bottom:none}
.totals{margin-left:auto;max-width:280px;margin-bottom:18px}
.totals div{display:flex;justify-content:space-between;gap:16px;padding:5px 0;font-size:.92rem}
.totals .total{margin-top:6px;padding-top:10px;border-top:2px solid var(--ink);font-weight:700;font-size:1.12rem}
.bank{margin:18px 0;padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:#f7f9fc}
.bank h2{margin:0 0 10px;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.bank div{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:.9rem}
.bank span{color:var(--muted)}
.note{color:var(--muted);font-size:.9rem;margin:12px 0}
.flash{background:#dcfce7;color:#166534;padding:12px 14px;border-radius:10px;font-weight:600;margin-bottom:14px}
.actions{margin-top:20px;display:flex;flex-direction:column;gap:8px}
.ok,.pay{font:inherit;font-weight:700;padding:14px 18px;border-radius:10px;cursor:pointer;width:100%;border:none;color:#fff}
.ok{background:var(--ok)}
.pay{background:var(--pay);font-size:16px}
.status{margin-top:18px}
`;

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

    const logoUrl = await logoUrlForClient(invoice.clientId);
    const amountDue = invoice.amountDuePence > 0 ? invoice.amountDuePence : invoice.totalPence;
    const canPayOnline =
      !!invoice.client.stripeConnectAccountId &&
      invoice.client.stripeConnectOnboarded &&
      (invoice.status === "SENT" || invoice.status === "OVERDUE" || invoice.status === "DRAFT");

    const wantsJson = (req.headers.accept || "").includes("application/json") || req.query.format === "json";
    if (wantsJson) {
      return res.json({
        status: invoice.status,
        businessName: invoice.client.businessName,
        logoUrl,
        customerName: invoice.customerName,
        reference: invoice.reference,
        lines: invoice.lines,
        subtotalPence: invoice.subtotalPence,
        vatPence: invoice.vatPence,
        totalPence: invoice.totalPence,
        amountDuePence: amountDue,
        depositAppliedPence: invoice.depositAppliedPence,
        dueDate: invoice.dueDate,
        bankName: invoice.bankName,
        bankSortCode: invoice.bankSortCode,
        bankAccountName: invoice.bankAccountName,
        bankAccountNumber: invoice.bankAccountNumber,
        canPayOnline,
        pdfUrl: invoice.pdfUrl,
        paidFlash: req.query.paid === "1",
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
            ${invoice.bankName ? `<div><span>Bank</span><strong>${esc(invoice.bankName)}</strong></div>` : ""}
            ${invoice.bankAccountName ? `<div><span>Account name</span><strong>${esc(invoice.bankAccountName)}</strong></div>` : ""}
            ${invoice.bankSortCode ? `<div><span>Sort code</span><strong>${esc(invoice.bankSortCode)}</strong></div>` : ""}
            ${invoice.bankAccountNumber ? `<div><span>Account number</span><strong>${esc(invoice.bankAccountNumber)}</strong></div>` : ""}
            ${invoice.reference ? `<div><span>Reference</span><strong>${esc(invoice.reference)}</strong></div>` : ""}
          </div>`
        : `<p class="note">Bank details will be provided by ${esc(invoice.client.businessName)}.</p>`;

    const paidFlash =
      req.query.paid === "1" ? `<p class="flash">Payment received — thank you!</p>` : "";

    let actions = "";
    if (invoice.status === "PAID") {
      actions = `<p class="status">Status: <strong>PAID</strong></p>`;
    } else if (invoice.status === "SENT" || invoice.status === "OVERDUE" || invoice.status === "DRAFT") {
      actions = `<div class="actions">`;
      if (canPayOnline) {
        actions += `<form method="POST" action="/i/${esc(invoice.publicToken)}/pay"><button type="submit" class="pay">Pay now · ${esc(formatGbp(amountDue))}</button></form>`;
      }
      actions += `<form method="POST" action="/i/${esc(invoice.publicToken)}/paid"><button type="submit" class="ok">I've paid by bank transfer</button></form>`;
      actions += `</div>`;
    } else {
      actions = `<p class="status">Status: <strong>${esc(invoice.status)}</strong></p>`;
    }

    const c = invoice.client;

    res.type("html").send(`<!doctype html>
<html lang="en-GB"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Invoice — ${esc(c.businessName)}</title>
<style>${DOC_CSS}</style>
</head><body>
<div class="page"><article class="doc"><div class="doc-inner">
  ${paidFlash}
  <header class="letterhead">
    <div class="brand">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(c.businessName)} logo"/>` : ""}
      <div class="brand-text">
        <h1>${esc(c.businessName)}</h1>
        <p class="trade">${esc(c.tradeTitle || "Invoice")}${c.vatNumber ? ` · VAT ${esc(c.vatNumber)}` : ""}</p>
      </div>
    </div>
    <div class="meta">
      <strong>INVOICE</strong>
      ${invoice.reference ? esc(invoice.reference) : ""}
      ${invoice.dueDate ? `<div style="margin-top:8px">Due ${esc(new Date(invoice.dueDate).toLocaleDateString("en-GB"))}</div>` : ""}
    </div>
  </header>

  <div class="party">
    <div class="box">
      <span class="label">Bill to</span>
      <strong>${invoice.customerName ? esc(invoice.customerName) : "Customer"}</strong>
    </div>
    <div class="box">
      <span class="label">From</span>
      <strong>${esc(c.businessName)}</strong>
    </div>
  </div>

  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${esc(formatGbp(invoice.subtotalPence))}</span></div>
    <div><span>VAT</span><span>${esc(formatGbp(invoice.vatPence))}</span></div>
    <div class="total"><span>Total</span><span>${esc(formatGbp(invoice.totalPence))}</span></div>
    ${
      invoice.depositAppliedPence > 0
        ? `<div><span>Deposit paid</span><span>−${esc(formatGbp(invoice.depositAppliedPence))}</span></div><div class="total"><span>Amount due</span><span>${esc(formatGbp(amountDue))}</span></div>`
        : ""
    }
  </div>

  ${bankBlock}
  ${invoice.pdfUrl ? `<p class="note"><a href="${esc(invoice.pdfUrl)}">Download PDF</a></p>` : ""}
  ${actions}
</div></article></div>
</body></html>`);
  } catch (err) {
    next(err);
  }
});

invoicePublicRouter.post("/:token/pay", async (req, res, next) => {
  try {
    const { url } = await createInvoicePayLink(req.params.token);
    res.redirect(303, url);
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
      return res
        .type("html")
        .send(
          `<!doctype html><meta charset=utf-8><p style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">Already marked paid. Thanks!</p>`
        );
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { paidReportedAt: new Date(), status: invoice.status === "DRAFT" ? "SENT" : invoice.status },
    });

    const amountDue = invoice.amountDuePence > 0 ? invoice.amountDuePence : invoice.totalPence;
    if (invoice.client.destPhone) {
      const msg = `${invoice.customerName || "Customer"} says they've paid invoice ${invoice.reference || ""} (${formatGbp(amountDue)}). Confirm in the app.`;
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
    res
      .type("html")
      .send(
        `<!doctype html><meta charset=utf-8><p style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">Thanks — we've told ${esc(invoice.client.businessName)} you've paid.</p>`
      );
  } catch (err) {
    next(err);
  }
});
