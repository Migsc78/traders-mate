/** API origin for production (Railway). Empty in local Vite → relative URLs + proxy. */
export function apiUrl(path: string): string {
  const base = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  if (!path.startsWith("/")) path = `/${path}`;

  if (import.meta.env.PROD && !base) {
    throw new Error(
      "VITE_API_BASE is not set. In Vercel → Settings → Environment Variables, set VITE_API_BASE to your Railway URL (e.g. https://….up.railway.app), then Redeploy."
    );
  }

  return base ? `${base}${path}` : path;
}
