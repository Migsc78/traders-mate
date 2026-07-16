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
    <div className="tradie-shell">
      <h1>Start free trial</h1>
      <p className="muted-text">Quote from the van. Chase by SMS. Get paid.</p>

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
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07…" required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Sending code…" : "Text me a code"}
          </button>
        </form>
      ) : (
        <form className="form" onSubmit={verify}>
          <p className="muted-text">Enter the 6-digit code we texted to {phone}</p>
          <label>
            Code
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Creating account…" : "Verify & start"}
          </button>
          <button type="button" className="linkish" onClick={() => setStep("form")}>
            Change details
          </button>
        </form>
      )}

      <p className="muted-text" style={{ marginTop: 20 }}>
        Already have an account? <Link to="/t/auth">Sign in</Link>
      </p>
    </div>
  );
}
