import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { consumeMagicOnce, getTradieSession, setTradieSession, tradieApi } from "../../api/tradie";

export default function TradieAuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const next = params.get("next") || "/t";
  const [error, setError] = useState("");
  const [routeKey, setRouteKey] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token) return;
    const existing = getTradieSession();
    if (existing) {
      navigate(next.startsWith("/t") ? next : "/t", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await consumeMagicOnce(token);
        if (cancelled) return;
        setTradieSession(r.sessionToken);
        navigate(next.startsWith("/t") ? next : "/t", { replace: true });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Login failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, next, navigate]);

  if (token && !error) {
    return (
      <div className="tradie-shell">
        <p>Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="tradie-shell">
      <h1>Tradie login</h1>
      <p className="muted-text">We text you a one-time link. No password.</p>
      {error && <p className="error">{error}</p>}
      {getTradieSession() && (
        <p>
          Already signed in. <Link to="/t">Open jobs →</Link>
        </p>
      )}
      <label>
        Your site route key
        <input value={routeKey} onChange={(e) => setRouteKey(e.target.value)} placeholder="tm_…" />
      </label>
      <button
        className="primary"
        disabled={sending || !routeKey.trim()}
        onClick={async () => {
          setSending(true);
          setError("");
          try {
            await tradieApi.requestMagic({ routeKey: routeKey.trim() });
            setError("");
            alert("Check your phone for the login SMS.");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not send link");
          } finally {
            setSending(false);
          }
        }}
      >
        {sending ? "Sending…" : "Text me a login link"}
      </button>
    </div>
  );
}
