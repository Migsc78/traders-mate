/** API origin for production (Railway). Empty in local Vite → relative URLs + proxy. */
export function apiUrl(path: string): string {
  let base = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  // Vercel is HTTPS — browsers block http:// API calls (mixed content).
  if (base.startsWith("http://")) {
    try {
      const host = new URL(base).host;
      if (/(?:^|\.)up\.railway\.app$/i.test(host)) {
        base = `https://${base.slice("http://".length)}`;
      }
    } catch {
      /* ignore bad URL */
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;

  if (import.meta.env.PROD && !base) {
    throw new Error(
      "VITE_API_BASE is not set. In Vercel → Settings → Environment Variables, set VITE_API_BASE to your Railway URL (https://….up.railway.app), then Redeploy."
    );
  }

  return base ? `${base}${path}` : path;
}
