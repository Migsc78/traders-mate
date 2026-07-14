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

    const wantsJson = (req.headers.accept || "").includes("application/json") || req.query.format === "json";
    if (wantsJson) {
      return res.json({
        status: quote.status,
        businessName: quote.client.businessName,
        tradeTitle: quote.client.tradeTitle,
        customerName: quote.enquiry?.name,
        lines: quote.lines,
        vatInclusive: quote.vatInclusive,
        subtotalPence: quote.subtotalPence,
        vatPence: quote.vatPence,
        totalPence: quote.totalPence,
        customerNote: quote.customerNote,
        assumptions: quote.assumptions,
        validUntil: quote.validUntil,
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
        ? `<form method="POST" action="/q/${esc(quote.publicToken)}/accept" style="display:inline"><button type="submit" class="ok">Accept quote</button></form>
           <form method="POST" action="/q/${esc(quote.publicToken)}/decline" style="display:inline;margin-left:8px"><button type="submit" class="no">Decline</button></form>`
        : `<p class="status">Status: <strong>${esc(quote.status)}</strong></p>`;

    res.type("html").send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Quote — ${esc(quote.client.businessName)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;color:#0f172a;background:#f8fafc}
h1{font-size:1.35rem;margin:0 0 4px} .sub{color:#64748b;margin:0 0 20px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:14px}
th{background:#f1f5f9;font-size:12px;text-transform:uppercase;color:#64748b}
.totals{margin-top:14px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px}
.totals div{display:flex;justify-content:space-between;margin:4px 0}
.total{font-weight:700;font-size:1.1rem}
.ok{background:#15803d;color:#fff;border:none;padding:12px 18px;border-radius:10px;font-weight:700;cursor:pointer}
.no{background:#fff;color:#b91c1c;border:1px solid #fecaca;padding:12px 18px;border-radius:10px;cursor:pointer}
.note{color:#475569;font-size:14px;margin-top:16px}
.legal{font-size:12px;color:#94a3b8;margin-top:24px;line-height:1.4}
.photos{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
.photos img{width:88px;height:88px;object-fit:cover;border-radius:8px}
</style></head><body>
<h1>${esc(quote.client.businessName)}</h1>
<p class="sub">${esc(quote.client.tradeTitle || "Trade quote")}${quote.enquiry ? ` · for ${esc(quote.enquiry.name)}` : ""}</p>
${quote.customerNote ? `<p class="note">${esc(quote.customerNote)}</p>` : ""}
${quote.enquiry?.photoUrls?.length ? `<div class="photos">${quote.enquiry.photoUrls.map((u) => `<img src="${esc(u)}" alt=""/>`).join("")}</div>` : ""}
<table><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${linesHtml}</tbody></table>
<div class="totals">
  <div><span>Subtotal</span><span>${esc(formatGbp(quote.subtotalPence))}</span></div>
  <div><span>VAT</span><span>${esc(formatGbp(quote.vatPence))}</span></div>
  <div class="total"><span>Total ${quote.vatInclusive ? "(inc VAT)" : "(ex VAT)"}</span><span>${esc(formatGbp(quote.totalPence))}</span></div>
  ${quote.validUntil ? `<div><span>Valid until</span><span>${esc(new Date(quote.validUntil).toLocaleDateString("en-GB"))}</span></div>` : ""}
</div>
${quote.assumptions ? `<p class="note"><strong>Notes:</strong> ${esc(quote.assumptions)}</p>` : ""}
<div style="margin-top:20px">${actions}</div>
<p class="legal">This quote is provided electronically. If you are a consumer and entered into this contract at a distance, you may have a 14-day cooling-off right under the Consumer Contracts Regulations — contact ${esc(quote.client.businessName)} for details.</p>
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
    await decide(req.params.token, "ACCEPTED");
    if ((req.headers.accept || "").includes("application/json")) return res.json({ ok: true, status: "ACCEPTED" });
    res.type("html").send(`<!doctype html><meta charset=utf-8><title>Accepted</title><p style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">Thanks — we've told the tradie you accepted.</p>`);
  } catch (err) {
    next(err);
  }
});

quotePublicRouter.post("/:token/decline", async (req, res, next) => {
  try {
    z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    await decide(req.params.token, "DECLINED");
    if ((req.headers.accept || "").includes("application/json")) return res.json({ ok: true, status: "DECLINED" });
    res.type("html").send(`<!doctype html><meta charset=utf-8><title>Declined</title><p style="font-family:sans-serif;max-width:420px;margin:60px auto;text-align:center">Quote declined. No further reminders will be sent.</p>`);
  } catch (err) {
    next(err);
  }
});

/** Internal cron tick — protect with shared secret header in production. */
export const followupsRouter = Router();
followupsRouter.post("/tick", async (req, res, next) => {
  try {
    const secret = req.headers["x-cron-secret"];
    if (env.MAGIC_LINK_SECRET && secret && secret !== env.MAGIC_LINK_SECRET) {
      throw new ApiError(401, "unauthorized", "Bad cron secret");
    }
    const result = await tickFollowUps();
    res.json(result);
  } catch (err) {
    next(err);
  }
});
