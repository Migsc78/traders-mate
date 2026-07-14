/** API origin for production (Railway). Empty in local Vite → relative URLs + proxy. */
export function apiUrl(path: string): string {
  const base = String(import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
  if (!path.startsWith("/")) path = `/${path}`;
  return base ? `${base}${path}` : path;
}
