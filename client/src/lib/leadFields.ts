import type { Lead } from "../types";

export function parseOpeningHours(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((line): line is string => typeof line === "string") : [];
  } catch {
    return [];
  }
}

export function googleDataTags(lead: Lead): string[] {
  const tags: string[] = [];
  if (lead.primaryType) tags.push(lead.primaryType.replace(/_/g, " "));
  if (parseOpeningHours(lead.openingHours).length) tags.push("Hours");
  if (lead.googleReviews?.length) tags.push(`${lead.googleReviews.length} reviews`);
  if (lead.editorialSummary) tags.push("Summary");
  if (lead.email) tags.push("Email");
  return tags;
}

export function formatLastFetched(at: string | null | undefined): string {
  if (!at) return "Not refreshed from Google yet";
  return `Last synced ${new Date(at).toLocaleString()}`;
}
