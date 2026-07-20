import { Router } from "express";
import { prisma } from "../db.js";
import { ApiError } from "../middleware/error.js";

export const certPublicRouter = Router();

const KIND_LABEL: Record<string, string> = {
  GAS_SAFETY: "Landlord Gas Safety Record (CP12)",
  MINOR_WORKS: "Minor Electrical Installation Works Certificate",
  EICR: "Electrical Installation Condition Report (EICR)",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

certPublicRouter.get("/:token", async (req, res, next) => {
  try {
    const cert = await prisma.certificate.findUnique({
      where: { publicToken: req.params.token },
      include: { client: { select: { businessName: true } } },
    });
    if (!cert || cert.status === "DRAFT") throw new ApiError(404, "not_found", "Certificate not found");

    if (cert.pdfUrl && req.query.download !== "0") {
      return res.redirect(302, cert.pdfUrl);
    }

    const label = KIND_LABEL[cert.kind] || cert.kind;
    res.type("html").send(`<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(label)} — ${esc(cert.client.businessName)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px;color:#0f172a}
a{color:#1d4ed8;font-weight:600}
</style></head><body>
<h1>${esc(label)}</h1>
<p>From <strong>${esc(cert.client.businessName)}</strong></p>
${cert.customerName ? `<p>For ${esc(cert.customerName)}</p>` : ""}
${cert.siteAddress ? `<p>${esc(cert.siteAddress)}</p>` : ""}
${cert.signedAt ? `<p>Signed ${esc(new Date(cert.signedAt).toLocaleString("en-GB"))}</p>` : ""}
${cert.pdfUrl ? `<p><a href="${esc(cert.pdfUrl)}">Download PDF</a></p>` : "<p>PDF not available yet.</p>"}
</body></html>`);
  } catch (err) {
    next(err);
  }
});
