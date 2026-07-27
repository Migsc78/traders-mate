import { Router } from "express";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";
import { KIND_LABEL } from "../services/certs/certificates.js";

export const certPublicRouter = Router();

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

certPublicRouter.get("/:token", async (req, res, next) => {
  try {
    const cert = await prisma.certificate.findUnique({
      where: { publicToken: req.params.token },
      include: { client: { select: { businessName: true } } },
    });
    if (!cert || !cert.pdfUrl) throw new ApiError(404, "not_found", "Certificate not found");
    // Incomplete drafts without a filed copy stay private
    if (cert.status === "DRAFT") throw new ApiError(404, "not_found", "Certificate not found");

    const label = KIND_LABEL[cert.kind] || "Compliance document";
    const isImage = (cert.fileContentType || "").startsWith("image/") || /\.(jpe?g|png|webp|heic)(\?|$)/i.test(cert.pdfUrl);

    if (!isImage && req.query.download !== "0") {
      return res.redirect(302, cert.pdfUrl);
    }

    res.type("html").send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(label)} — ${esc(cert.client.businessName)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#0f172a;background:#f8fafc}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px;margin-top:16px}
img{max-width:100%;height:auto;border-radius:10px;border:1px solid #e2e8f0}
a{color:#1d4ed8;font-weight:600}
.muted{color:#64748b;font-size:14px}
</style></head><body>
<h1>${esc(label)}</h1>
<p class="muted">Filed by <strong>${esc(cert.client.businessName)}</strong> — a copy of their certificate paperwork.</p>
${cert.customerName ? `<p>For ${esc(cert.customerName)}</p>` : ""}
${cert.siteAddress ? `<p>${esc(cert.siteAddress)}</p>` : ""}
${cert.issuedAt ? `<p class="muted">Issued ${esc(new Date(cert.issuedAt).toLocaleDateString("en-GB"))}</p>` : ""}
${cert.serviceDueAt ? `<p class="muted">Next due ${esc(new Date(cert.serviceDueAt).toLocaleDateString("en-GB"))}</p>` : ""}
<div class="card">
${
  isImage
    ? `<img src="${esc(cert.pdfUrl)}" alt="${esc(label)}"/>`
    : `<p><a href="${esc(cert.pdfUrl)}">Download / open file</a></p>`
}
</div>
</body></html>`);
  } catch (err) {
    next(err);
  }
});
