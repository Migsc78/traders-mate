const TRADIE_MANIFEST = "/manifest.webmanifest";
const ADMIN_MANIFEST = "/admin.webmanifest";
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

/** Point the document manifest at admin or tradie so Add to Home Screen uses the right start_url. */
export function applyWebManifestForPath(pathname: string) {
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const href = isAdmin ? ADMIN_MANIFEST : TRADIE_MANIFEST;

  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]'));
  let link = links[0];
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  for (const extra of links.slice(1)) extra.remove();

  if (link.getAttribute("href") !== href) {
    link.href = href;
  }
  setAppleWebAppTitle(isAdmin ? ADMIN_APP_TITLE : TRADIE_APP_TITLE);
}
