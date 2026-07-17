import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { clearOperatorToken, getOperatorToken, setOperatorToken } from "../lib/operatorAuth";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/admin/search";

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await api.health();
        if (cancelled) return;
        setAuthRequired(!!health.operatorAuthRequired);
        if (!health.operatorAuthRequired) {
          navigate(from, { replace: true });
          return;
        }
        if (getOperatorToken()) {
          try {
            await api.operatorSession();
            if (!cancelled) navigate(from, { replace: true });
          } catch {
            clearOperatorToken();
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not reach API");
        setAuthRequired(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const next = password.trim();
    if (!next) {
      setError("Enter your admin password");
      setBusy(false);
      return;
    }

    try {
      const result = await api.operatorLogin(next);
      if (result.open) {
        clearOperatorToken();
        navigate(from, { replace: true });
        return;
      }
      if (!result.sessionToken) {
        throw new Error("Login did not return a session");
      }
      setOperatorToken(result.sessionToken);
      await api.operatorSession();
      navigate(from, { replace: true });
    } catch (err) {
      clearOperatorToken();
      setError(err instanceof Error ? err.message : "Incorrect password");
    } finally {
      setBusy(false);
    }
  };

  if (authRequired === false) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <div className="admin-login-brand">
          <div className="brand">
            Tradies<span>Mate</span>
          </div>
          <p>Admin access</p>
        </div>

        <form className="form" onSubmit={onSubmit}>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="admin-login-note">
          Set <code>OPERATOR_ADMIN_PASSWORD</code> on the API. Session lasts 14 days on this
          browser.
        </p>
        <p className="admin-login-back">
          <Link to="/">← Back to site</Link>
        </p>
      </div>
    </div>
  );
}
