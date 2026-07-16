import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { setTradieSession, tradieApi } from "../../api/tradie";

export default function TradieSignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "code">("form");
  const [businessName, setBusinessName] = useState("");
  const [tradeTitle, setTradeTitle] = useState("");
  const [town, setTown] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await tradieApi.signupStart({ businessName, tradeTitle: tradeTitle || undefined, town: town || undefined, phone });
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await tradieApi.signupVerify({ phone, code });
      setTradieSession(result.sessionToken);
      navigate("/t");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tradie-shell t-gate">
      <div className="t-gate-brand">
        <div className="t-brand-mark">TM</div>
        <h1>Start your free trial</h1>
        <p>Quote from the van. Chase by SMS. Get paid.</p>
      </div>

      <div className="t-gate-card">
        {step === "form" ? (
          <form className="form" onSubmit={start}>
            <label>
              Business name
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
            </label>
            <label>
              Trade
              <input value={tradeTitle} onChange={(e) => setTradeTitle(e.target.value)} placeholder="Plumber" />
            </label>
            <label>
              Town
              <input value={town} onChange={(e) => setTown(e.target.value)} placeholder="Woking" />
            </label>
            <label>
              Mobile
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07…"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary t-btn--block" type="submit" disabled={busy}>
              {busy ? "Sending code…" : "Text me a code"}
            </button>
          </form>
        ) : (
          <form className="form" onSubmit={verify}>
            <p className="t-otp-sent">
              Enter the 6-digit code we texted to <strong>{phone}</strong>
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
            {error && <p className="error">{error}</p>}
            <button className="primary t-btn--block" type="submit" disabled={busy}>
              {busy ? "Creating account…" : "Verify & start"}
            </button>
            <button type="button" className="linkish" onClick={() => setStep("form")}>
              Change details
            </button>
          </form>
        )}
      </div>

      <p className="t-gate-alt">
        Already have an account? <Link to="/t/auth">Sign in</Link>
      </p>
    </div>
  );
}
