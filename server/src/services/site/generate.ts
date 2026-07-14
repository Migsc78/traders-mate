import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../db.js";
import { env } from "../../env.js";
import { renderSite } from "./template.js";
import { buildSiteData, type LeadLike, type SiteOverrides } from "./siteData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/generated-sites/<slug>/index.html
export const SITES_DIR = path.resolve(__dirname, "../../../generated-sites");

export interface GenerateResult {
  slug: string;
  indexPath: string;
  previewUrl: string;
  html: string;
}

export async function generateSite(lead: LeadLike, overrides: SiteOverrides = {}): Promise<GenerateResult> {
  const data = buildSiteData(lead, overrides);
  const html = renderSite(data);

  const dir = path.join(SITES_DIR, data.slug);
  await fs.mkdir(dir, { recursive: true });
  const indexPath = path.join(dir, "index.html");
  await fs.writeFile(indexPath, html, "utf8");

  return {
    slug: data.slug,
    indexPath,
    previewUrl: `/sites/${data.slug}/`,
    html,
  };
}

/** If this lead has a converted client, bake routeKey + intake URL into the site. */
export async function routingOverridesForLead(leadId: string): Promise<SiteOverrides> {
  const client = await prisma.client.findFirst({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    select: { routeKey: true },
  });
  if (!client) return {};
  return {
    routeKey: client.routeKey,
    intakeBase: env.PUBLIC_BASE_URL.replace(/\/$/, ""),
  };
}

export async function generateSiteForLead(
  lead: LeadLike & { id: string },
  overrides: SiteOverrides = {}
): Promise<GenerateResult> {
  const routing = await routingOverridesForLead(lead.id);
  return generateSite(lead, { ...overrides, ...routing });
}
