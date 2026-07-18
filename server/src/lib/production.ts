/** True when running on Railway / NODE_ENV=production. */
export function isProduction(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  if (process.env.RAILWAY_ENVIRONMENT === "production") return true;
  if (process.env.RAILWAY_ENVIRONMENT_NAME === "production") return true;
  return false;
}
