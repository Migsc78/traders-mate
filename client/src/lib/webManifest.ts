const TRADIE_MANIFEST = "/manifest.webmanifest";
const TRADIE_APP_TITLE = "TradiesMate";
const ADMIN_APP_TITLE = "TM Admin";

function setAppleWebAppTitle(title: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "apple-mobile-web-app-title";
    document.head.appendChild(meta);
  }
  meta.content = title;
}

/**
 * iOS Safari prefers a fixed manifest start_url over the page you were viewing.
 * On /admin we remove the manifest link so Add to Home Screen bookmarks the current URL.
 * Elsewhere we keep the site PWA manifest (no fixed start_url).
 */
export function applyWebManifestForPath(pathname: string) {
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]'));

  if (isAdmin) {
    for (const link of links) link.remove();
    setAppleWebAppTitle(ADMIN_APP_TITLE);
    return;
  }

  let link = links[0];
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  for (const extra of links.slice(1)) extra.remove();
  if (link.getAttribute("href") !== TRADIE_MANIFEST) {
    link.href = TRADIE_MANIFEST;
  }
  setAppleWebAppTitle(TRADIE_APP_TITLE);
}
