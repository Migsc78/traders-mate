import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { consumeMagicOnce, getTradieSession, setTradieSession, tradieApi } from "../../api/tradie";

export default function TradieAuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const next = params.get("next") || "/t";
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [sending, setSending] = useState(false);
  const [routeKey, setRouteKey] = useState("");

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
      <div className="tradie-shell t-gate">
        <div className="t-gate-brand">
          <div className="t-brand-mark">TM</div>
          <h1>Signing you in…</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="tradie-shell t-gate">
      <div className="t-gate-brand">
        <div className="t-brand-mark">TM</div>
        <h1>Welcome back</h1>
        <p>Sign in with a one-time code. No password.</p>
      </div>

      <div className="t-gate-card">
        {error && <p className="error">{error}</p>}
        {getTradieSession() && (
          <p>
            Already signed in. <Link to="/t">Open jobs →</Link>
          </p>
        )}

        {step === "phone" ? (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSending(true);
              setError("");
              try {
                await tradieApi.loginStart(phone.trim());
                setStep("code");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not send code");
              } finally {
                setSending(false);
              }
            }}
          >
            <label>
              Mobile number
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07…"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>
            <button className="primary t-btn--block" type="submit" disabled={sending || !phone.trim()}>
              {sending ? "Sending…" : "Text me a code"}
            </button>
          </form>
        ) : (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSending(true);
              setError("");
              try {
                const r = await tradieApi.loginVerify({ phone: phone.trim(), code: code.trim() });
                setTradieSession(r.sessionToken);
                navigate("/t");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Invalid code");
              } finally {
                setSending(false);
              }
            }}
          >
            <p className="t-otp-sent">
              Code sent to <strong>{phone}</strong>
            </p>
            <label>
              Code
              <input
                className="t-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
            </label>
            <button className="primary t-btn--block" type="submit" disabled={sending || !code.trim()}>
              {sending ? "Checking…" : "Sign in"}
            </button>
            <button type="button" className="linkish" onClick={() => setStep("phone")}>
              Use a different number
            </button>
          </form>
        )}

        <details open>
          <summary>Or sign in with route key</summary>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const key = routeKey.trim();
              if (!key) return;
              setSending(true);
              setError("");
              try {
                if (key.startsWith("seed_tm_")) {
                  const r = await tradieApi.seedLogin(key);
                  setTradieSession(r.sessionToken);
                  navigate("/t");
                  return;
                }
                await tradieApi.requestMagic({ routeKey: key });
                setError("Login link sent by SMS — open the link on this phone.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not sign in");
              } finally {
                setSending(false);
              }
            }}
          >
            <label>
              Route key
              <input
                value={routeKey}
                onChange={(e) => setRouteKey(e.target.value)}
                placeholder="seed_tm_demo_plumbing"
              />
            </label>
            <button className="t-btn--block" type="submit" disabled={sending || !routeKey.trim()}>
              {sending
                ? "Signing in…"
                : routeKey.trim().startsWith("seed_tm_")
                  ? "Sign in (seed — no SMS)"
                  : "Text me a login link"}
            </button>
          </form>
        </details>
      </div>

      <p className="t-gate-alt">
        New here? Trials open soon — <Link to="/">learn more</Link>
      </p>
    </div>
  );
}
