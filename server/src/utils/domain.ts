// Extract the registrable domain (eTLD+1) from a URL, handling common UK
// second-level TLDs (co.uk, org.uk, ...). Good enough for classification.

const UK_SECOND_LEVELS = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "net.uk",
  "sch.uk",
  "gov.uk",
  "ac.uk",
]);

export function getHostname(url: string): string | null {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function registrableDomain(url: string): string | null {
  const host = getHostname(url);
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return host;

  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");

  if (UK_SECOND_LEVELS.has(lastTwo)) {
    // e.g. example.co.uk -> keep 3 labels
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}
