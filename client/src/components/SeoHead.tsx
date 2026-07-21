import { useEffect } from "react";

const SITE = "https://tradiesmate.co.uk";
const DEFAULT_DESCRIPTION =
  "TradiesMate helps UK trades turn missed calls into quoted jobs — dedicated number, SMS rescue, van quotes, Pay Now, diary and certificates.";
const DEFAULT_OG = `${SITE}/og-image.png`;

type SeoHeadProps = {
  title: string;
  description?: string;
  path?: string;
  noindex?: boolean;
  ogImage?: string;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

/** Sets document title + social/canonical meta for the current route. */
export function SeoHead({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  noindex = false,
  ogImage = DEFAULT_OG,
}: SeoHeadProps) {
  useEffect(() => {
    const url = `${SITE}${path === "/" ? "/" : path}`;
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:site_name", "TradiesMate");
    upsertMeta("property", "og:locale", "en_GB");
    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", ogImage);
    upsertCanonical(url);
  }, [title, description, path, noindex, ogImage]);

  return null;
}

export const SEO_DEFAULTS = {
  site: SITE,
  description: DEFAULT_DESCRIPTION,
  ogImage: DEFAULT_OG,
} as const;
