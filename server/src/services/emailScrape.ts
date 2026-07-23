const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IGNORE_DOMAINS = new Set([
  "example.com",
  "example.org",
  "sentry.io",
  "wixpress.com",
  "schema.org",
  "w3.org",
  "googleapis.com",
  "gstatic.com",
  "google.com",
  "googlemail.com",
  "cloudflare.com",
  "jquery.com",
  "github.com",
  "gravatar.com",
]);

const CONTACT_PATHS = [
  "/contact",
  "/contact-us",
  "/contactus",
  "/get-in-touch",
  "/getintouch",
  "/about",
  "/about-us",
  "/aboutus",
  "/enquiry",
  "/enquiries",
];

const CONTACT_LINK_RE =
  /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

/** Best-effort email from HTML (mailto first, then visible text). */
export function extractEmailFromHtml(html: string): string | null {
  const mailto = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (mailto?.[1] && isPlausibleEmail(mailto[1])) return mailto[1].toLowerCase();

  const matches = html.match(EMAIL_RE) ?? [];
  for (const raw of matches) {
    if (isPlausibleEmail(raw)) return raw.toLowerCase();
  }
  return null;
}

export function isPlausibleEmail(raw: string): boolean {
  const email = raw.toLowerCase().trim();
  if (!email.includes("@") || email.length > 120) return false;
  if (email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".jpeg") || email.endsWith(".webp")) {
    return false;
  }
  const domain = email.split("@")[1];
  if (!domain || IGNORE_DOMAINS.has(domain)) return false;
  // Skip obvious template / tracking junk
  if (/(noreply|no-reply|donotreply|mailer-daemon|postmaster)@/i.test(email)) return false;
  return true;
}

function normalizeBase(url: string): URL {
  const withScheme = url.includes("://") ? url : `https://${url}`;
  return new URL(withScheme);
}

/** Resolve href against a page URL; only keep same-site http(s) links. */
export function resolveSameSiteUrl(pageUrl: string, href: string): string | null {
  try {
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) return null;
    if (href.toLowerCase().startsWith("mailto:") || href.toLowerCase().startsWith("tel:")) return null;
    const base = normalizeBase(pageUrl);
    const resolved = new URL(href, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    if (resolved.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

/** Pull likely contact/about links from homepage HTML. */
export function findContactLinks(pageUrl: string, html: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  CONTACT_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CONTACT_LINK_RE.exec(html)) !== null) {
    const href = m[1] ?? "";
    const text = (m[2] ?? "").replace(/<[^>]+>/g, " ").toLowerCase();
    const pathHint = href.toLowerCase();
    const looksContact =
      /contact|get\s*in\s*touch|enquire|inquiry|about\s*us|about/.test(text) ||
      /contact|get-?in-?touch|about|enquir/.test(pathHint);
    if (!looksContact) continue;
    const absolute = resolveSameSiteUrl(pageUrl, href);
    if (!absolute || seen.has(absolute)) continue;
    seen.add(absolute);
    found.push(absolute);
    if (found.length >= 6) break;
  }
  return found;
}

/** Common contact/about paths on the same origin as the homepage. */
export function contactPathCandidates(homepageUrl: string): string[] {
  try {
    const base = normalizeBase(homepageUrl);
    const origin = `${base.protocol}//${base.host}`;
    return CONTACT_PATHS.map((p) => `${origin}${p}`);
  } catch {
    return [];
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: FETCH_HEADERS,
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (ctype && !/html|text\/plain|xml/i.test(ctype)) return null;
    return (await res.text()).slice(0, 150_000);
  } catch {
    return null;
  }
}

/**
 * Scrape email from a business website: homepage → contact links → common paths.
 * Caps outbound GETs so search enrichment stays bounded.
 */
export async function scrapeEmailFromWebsite(url: string): Promise<string | null> {
  let homepage: string;
  try {
    homepage = normalizeBase(url).toString();
  } catch {
    return null;
  }

  const seen = new Set<string>();
  const tryUrl = async (target: string): Promise<string | null> => {
    const key = target.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    const html = await fetchHtml(target);
    if (!html) return null;
    return extractEmailFromHtml(html);
  };

  const homeHtml = await fetchHtml(homepage);
  if (homeHtml) {
    seen.add(homepage.replace(/\/$/, "").toLowerCase());
    const fromHome = extractEmailFromHtml(homeHtml);
    if (fromHome) return fromHome;

    for (const link of findContactLinks(homepage, homeHtml)) {
      const email = await tryUrl(link);
      if (email) return email;
    }
  }

  for (const pathUrl of contactPathCandidates(homepage)) {
    if (seen.size >= 8) break;
    const email = await tryUrl(pathUrl);
    if (email) return email;
  }

  return null;
}
