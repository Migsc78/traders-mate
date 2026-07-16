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
      <div className="tradie-shell">
        <p>Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="tradie-shell">
      <h1>Tradie login</h1>
      <p className="muted-text">Sign in with a one-time code. No password.</p>
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
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" required />
          </label>
          <button className="primary" type="submit" disabled={sending || !phone.trim()}>
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
          <p className="muted-text">Code sent to {phone}</p>
          <label>
            Code
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required />
          </label>
          <button className="primary" type="submit" disabled={sending || !code.trim()}>
            {sending ? "Checking…" : "Sign in"}
          </button>
          <button type="button" className="linkish" onClick={() => setStep("phone")}>
            Use a different number
          </button>
        </form>
      )}

      <details style={{ marginTop: 24 }}>
        <summary className="muted-text">Or use magic link (route key)</summary>
        <label>
          Route key
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
              alert("Check your phone for the login SMS.");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not send link");
            } finally {
              setSending(false);
            }
          }}
        >
          Text me a login link
        </button>
      </details>

      <p className="muted-text" style={{ marginTop: 20 }}>
        New here? <Link to="/signup">Start a free trial</Link>
      </p>
    </div>
  );
}
