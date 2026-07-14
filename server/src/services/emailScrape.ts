const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IGNORE = new Set(["example.com", "sentry.io", "wixpress.com", "schema.org"]);

/** Best-effort email from a public business page (mailto links first, then visible text). */
export function extractEmailFromHtml(html: string): string | null {
  const mailto = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (mailto) return mailto[1]!.toLowerCase();

  const matches = html.match(EMAIL_RE) ?? [];
  for (const raw of matches) {
    const email = raw.toLowerCase();
    const domain = email.split("@")[1];
    if (!domain || IGNORE.has(domain) || email.endsWith(".png") || email.endsWith(".jpg")) continue;
    return email;
  }
  return null;
}

export async function scrapeEmailFromWebsite(url: string): Promise<string | null> {
  const target = url.includes("://") ? url : `https://${url}`;
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractEmailFromHtml(html.slice(0, 120_000));
  } catch {
    return null;
  }
}
