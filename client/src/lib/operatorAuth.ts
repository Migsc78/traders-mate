const STORAGE_KEY = "tm_operator_token";

/** Prefer an explicit session token from login; fall back to build-time env for local/dev. */
export function getOperatorToken(): string {
  if (typeof window !== "undefined") {
    const stored = String(localStorage.getItem(STORAGE_KEY) || "").trim();
    if (stored) return stored;
  }
  return String(import.meta.env.VITE_OPERATOR_API_TOKEN || "").trim();
}

export function setOperatorToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token.trim());
}

export function clearOperatorToken() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasOperatorSession(): boolean {
  return !!getOperatorToken();
}
