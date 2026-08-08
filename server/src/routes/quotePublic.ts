import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { sendMessage } from "../services/messaging/sender.js";
import { cancelQuoteFollowUps } from "../services/quotes/followups.js";
import { formatGbp } from "../services/quotes/money.js";
import { tickFollowUps } from "../services/quotes/followups.js";
import { env } from "../env.js";

export const quotePublicRouter = Router();

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
:root{--ink:#0b1f3a;--muted:#5b6b7c;--line:#d7dee8;--paper:#fff;--bg:#e8edf3;--accent:#ff5a1f;--ok:#15803d;--no:#b91c1c}
*{box-sizing:border-box}
body{margin:0;font-family:"DM Sans",system-ui,sans-serif;color:var(--ink);background:var(--bg);line-height:1.45}
.page{max-width:720px;margin:28px auto;padding:0 14px 40px}
.doc{background:var(--paper);border:1px solid var(--line);border-radius:4px;box-shadow:0 18px 50px rgba(11,31,58,.08),0 0 0 1px rgba(11,31,58,.03);overflow:hidden}
.doc-inner{padding:28px 28px 32px;border-top:4px solid var(--accent)}
@media(min-width:640px){.doc-inner{padding:40px 44px 44px}}
.letterhead{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding-bottom:22px;border-bottom:1px solid var(--line);margin-bottom:22px}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.brand img{width:72px;height:72px;object-fit:contain;border-radius:10px;background:#f4f7fb;border:1px solid var(--line);flex:none}
.brand-text{min-width:0}
.brand-text h1{font-family:Fraunces,Georgia,serif;font-size:1.45rem;font-weight:700;margin:0 0 4px;letter-spacing:-.02em;line-height:1.15}
.brand-text .trade{margin:0;color:var(--muted);font-size:.92rem}
.meta{text-align:right;font-size:.84rem;color:var(--muted);flex:none}
.meta strong{display:block;color:var(--ink);font-size:.95rem;margin-bottom:4px}
.contact{margin-top:8px;font-size:.8rem;color:var(--muted)}
.party{display:grid;gap:8px;margin-bottom:22px}
@media(min-width:560px){.party{grid-template-columns:1fr 1fr;gap:18px}}
.party .box{background:#f7f9fc;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.party .label{display:block;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:4px}
.party strong{font-size:1rem}
table{width:100%;border-collapse:collapse;margin:6px 0 18px;border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:.92rem;vertical-align:top}
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
.terms{margin-top:16px;padding:12px 14px;border-left:3px solid var(--accent);background:#fff7f3;font-size:.9rem;color:#3b4554}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.ok,.no{font:inherit;font-weight:700;padding:12px 18px;border-radius:10px;cursor:pointer}
.ok{background:var(--ok);color:#fff;border:none}
.no{background:#fff;color:var(--no);border:1px solid #fecaca}
.status{margin-top:18px;font-size:.95rem}
.legal{font-size:.75rem;color:#8a97a8;margin:22px 0 0;line-height:1.5;padding-top:16px;border-top:1px solid var(--line)}
.photos{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px}
.photos img{width:88px;height:88px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
`;

quotePublicRouter.get("/:token", async (req, res, next) => {
  try {
    const quote = await prisma.quote.findUnique({
      where: { publicToken: req.params.token },
      include: {
        lines: { orderBy: { sort: "asc" } },
        client: true,
        enquiry: true,
      },
    });
    if (!quote || quote.status === "DELETED") throw new ApiError(404, "not_found", "Quote not found");

    const logoUrl = await logoUrlForClient(quote.clientId);
    const c = quote.client;

    const wantsJson = (req.headers.accept || "").includes("application/json") || req.query.format === "json";
    if (wantsJson) {
      return res.json({
        status: quote.status,
        businessName: c.businessName,
        tradeTitle: c.tradeTitle,
        logoUrl,
        customerName: quote.enquiry?.name,
        lines: quote.lines,
        vatInclusive: quote.vatInclusive,
        subtotalPence: quote.subtotalPence,
        vatPence: quote.vatPence,
        totalPence: quote.totalPence,
        customerNote: quote.customerNote,
        assumptions: quote.assumptions,
        termsNote: quote.termsNote,
        validUntil: quote.validUntil,
        bankName: c.bankName,
        bankSortCode: c.bankSortCode,
        bankAccountName: c.bankAccountName,
        bankAccountNumber: c.bankAccountNumber,
        photos: quote.enquiry?.photoUrls || [],
      });
    }

    const linesHtml = quote.lines
      .map(
        (l) =>
          `<tr><td>${esc(l.label)}</td><td>${l.qty} ${esc(l.unit.toLowerCase())}</td><td>${esc(formatGbp(Math.round(l.qty * l.unitPricePence)))}</td></tr>`
      )
      .join("");

    const actions =
      quote.status === "SENT"
        ? `<div class="actions">
            <form method="POST" action="/q/${esc(quote.publicToken)}/accept"><button type="submit" class="ok">Accept quote</button></form>
            <form method="POST" action="/q/${esc(quote.publicToken)}/decline"><button type="submit" class="no">Decline</button></form>
          </div>`
        : `<p class="status">Status: <strong>${esc(quote.status)}</strong></p>`;

    const contactBits = [
      c.addressLine1,
      c.addressLine2,
      [c.town, c.postcode].filter(Boolean).join(" "),
      c.vatNumber ? `VAT ${c.vatNumber}` : null,
    ]
      .filter(Boolean)
      .map((x) => esc(String(x)));

    const bankBlock =
      c.bankAccountNumber || c.bankSortCode
        ? `<div class="bank">
            <h2>Bank details</h2>
            ${c.bankName ? `<div><span>Bank</span><strong>${esc(c.bankName)}</strong></div>` : ""}
            ${c.bankAccountName ? `<div><span>Account name</span><strong>${esc(c.bankAccountName)}</strong></div>` : ""}
            ${c.bankSortCode ? `<div><span>Sort code</span><strong>${esc(c.bankSortCode)}</strong></div>` : ""}
            ${c.bankAccountNumber ? `<div><span>Account number</span><strong>${esc(c.bankAccountNumber)}</strong></div>` : ""}
            ${quote.reference ? `<div><span>Reference</span><strong>${esc(quote.reference)}</strong></div>` : ""}
          </div>`
        : "";

    const issued = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    res.type("html").send(`<!doctype html>
<html lang="en-GB"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Quote — ${esc(c.businessName)}</title>
<style>${DOC_CSS}</style>
</head><body>
<div class="page"><article class="doc"><div class="doc-inner">
  <header class="letterhead">
    <div class="brand">
      ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${esc(c.businessName)} logo"/>` : ""}
      <div class="brand-text">
        <h1>${esc(c.businessName)}</h1>
        <p class="trade">${esc(c.tradeTitle || "Trade quote")}</p>
        ${contactBits.length ? `<p class="contact">${contactBits.join(" · ")}</p>` : ""}
      </div>
    </div>
    <div class="meta">
      <strong>QUOTE</strong>
      ${quote.reference ? esc(quote.reference) : ""}
      <div style="margin-top:8px">${esc(issued)}</div>
      ${quote.validUntil ? `<div>Valid until ${esc(new Date(quote.validUntil).toLocaleDateString("en-GB"))}</div>` : ""}
    </div>
  </header>

  <div class="party">
    <div class="box">
      <span class="label">Prepared for</span>
      <strong>${quote.enquiry ? esc(quote.enquiry.name) : "Customer"}</strong>
      ${quote.enquiry?.phone ? `<div style="color:var(--muted);font-size:.88rem;margin-top:4px">${esc(quote.enquiry.phone)}</div>` : ""}
    </div>
    <div class="box">
      <span class="label">From</span>
      <strong>${esc(c.businessName)}</strong>
      ${c.destPhone ? `<div style="color:var(--muted);font-size:.88rem;margin-top:4px">${esc(c.destPhone)}</div>` : ""}
    </div>
  </div>

  ${quote.customerNote ? `<p class="note">${esc(quote.customerNote)}</p>` : ""}
  ${quote.enquiry?.photoUrls?.length ? `<div class="photos">${quote.enquiry.photoUrls.map((u) => `<img src="${esc(u)}" alt=""/>`).join("")}</div>` : ""}

  <table>
    <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${esc(formatGbp(quote.subtotalPence))}</span></div>
    <div><span>VAT</span><span>${esc(formatGbp(quote.vatPence))}</span></div>
    <div class="total"><span>Total ${quote.vatInclusive ? "(inc VAT)" : "(ex VAT)"}</span><span>${esc(formatGbp(quote.totalPence))}</span></div>
    ${
      quote.depositPercent > 0
        ? `<div><span>Deposit (${quote.depositPercent}%)</span><span>${esc(formatGbp(quote.depositPence))}${quote.depositPaidAt ? " · paid" : " on accept"}</span></div>`
        : ""
    }
  </div>

  ${bankBlock}
  ${quote.termsNote ? `<div class="terms">${esc(quote.termsNote)}</div>` : ""}
  ${quote.assumptions ? `<p class="note"><strong>Notes:</strong> ${esc(quote.assumptions)}</p>` : ""}
  ${actions}
  <p class="legal">This quote is provided electronically by ${esc(c.businessName)}. If you are a consumer and entered into this contract at a distance, you may have a 14-day cooling-off right under the Consumer Contracts Regulations — contact ${esc(c.businessName)} for details.</p>
</div></article></div>
</body></html>`);
  } catch (err) {
    next(err);
  }
});

async function decide(token: string, status: "ACCEPTED" | "DECLINED") {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: token },
    include: { client: true, enquiry: true },
  });
  if (!quote || quote.status === "DELETED") throw new ApiError(404, "not_found", "Quote not found");
  if (quote.status !== "SENT") throw new ApiError(400, "not_open", `Quote is ${quote.status}`);

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status, decidedAt: new Date() },
  });
  await cancelQuoteFollowUps(quote.id);

  if (quote.client.destPhone) {
    const msg =
      status === "ACCEPTED"
        ? `${quote.enquiry?.name || "Customer"} accepted your quote (${formatGbp(quote.totalPence)}).`
        : `${quote.enquiry?.name || "Customer"} declined your quote (${formatGbp(quote.totalPence)}).`;
    try {
      await sendMessage({ to: quote.client.destPhone, channel: quote.client.destChannel, body: msg });
    } catch {
      /* non-fatal */
    }
  }
  return quote;
}

quotePublicRouter.post("/:token/accept", async (req, res, next) => {
  try {
    const quote = await decide(req.params.token, "ACCEPTED");
    const needsDeposit =
      quote.depositPercent > 0 &&
      quote.depositPence > 0 &&
      !quote.depositPaidAt &&
      !!quote.client.stripeConnectAccountId &&
      quote.client.stripeConnectOnboarded;

    if (needsDeposit) {
      const { createConnectPaymentCheckout } = await import("../services/billing/connect.js");
      const { appPublicUrl } = await import("../services/quotes/magicAuth.js");
      const base = appPublicUrl();
      const session = await createConnectPaymentCheckout({
        connectedAccountId: quote.client.stripeConnectAccountId!,
        amountPence: quote.depositPence,
        currency: quote.currency,
        description: `Deposit for quote — ${quote.client.businessName}`,
        successUrl: `${base}/q/${quote.publicToken}?deposit=1`,
        cancelUrl: `${base}/q/${quote.publicToken}?deposit_cancelled=1`,
        clientId: quote.clientId,
        metadata: {
          type: "deposit",
          quoteId: quote.id,
          publicToken: quote.publicToken,
        },
      });
      if (session.sessionId) {
        await prisma.quote.update({
          where: { id: quote.id },
          data: { depositStripeSessionId: session.sessionId },
        });
      }
      if ((req.headers.accept || "").includes("application/json")) {
        return res.json({ ok: true, status: "ACCEPTED", depositUrl: session.url });
      }
      return res.redirect(303, session.url);
    }

    if ((req.headers.accept || "").includes("application/json")) return res.json({ ok: true, status: "ACCEPTED" });
    res
      .type("html")
      .send(
        `<!doctype html><meta charset=utf-8><title>Accepted</title><p style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">Thanks — we've told the tradie you accepted.</p>`
      );
  } catch (err) {
    next(err);
  }
});

quotePublicRouter.post("/:token/decline", async (req, res, next) => {
  try {
    z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    await decide(req.params.token, "DECLINED");
    if ((req.headers.accept || "").includes("application/json")) return res.json({ ok: true, status: "DECLINED" });
    res
      .type("html")
      .send(
        `<!doctype html><meta charset=utf-8><title>Declined</title><p style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">Quote declined. No further reminders will be sent.</p>`
      );
  } catch (err) {
    next(err);
  }
});

/** Internal cron tick — requires x-cron-secret (CRON_SECRET or MAGIC_LINK_SECRET). */
export const followupsRouter = Router();
followupsRouter.post("/tick", async (req, res, next) => {
  try {
    const { secretsEqual } = await import("../lib/secureCompare.js");
    const expected = (env.CRON_SECRET?.trim() || env.MAGIC_LINK_SECRET?.trim() || "");
    const provided = String(req.headers["x-cron-secret"] || "");
    if (!expected || !provided || !secretsEqual(provided, expected)) {
      throw new ApiError(401, "unauthorized", "Cron secret required");
    }
    const result = await tickFollowUps();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
