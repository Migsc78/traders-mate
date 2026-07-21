import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { setTradieSession, tradieApi } from "../../api/tradie";

export default function TradieSignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite")?.trim() || "";

  const [signupsOpen, setSignupsOpen] = useState<boolean | null>(null);
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken);
  const [inviteError, setInviteError] = useState("");
  const [inviteOk, setInviteOk] = useState(false);

  const [step, setStep] = useState<"form" | "code">("form");
  const [businessName, setBusinessName] = useState("");
  const [tradeTitle, setTradeTitle] = useState("");
  const [town, setTown] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    tradieApi
      .signupStatus()
      .then((s) => {
        if (!cancelled) setSignupsOpen(!!s.open);
      })
      .catch(() => {
        if (!cancelled) setSignupsOpen(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!inviteToken) {
      setInviteLoading(false);
      setInviteOk(false);
      return;
    }
    let cancelled = false;
    setInviteLoading(true);
    setInviteError("");
    tradieApi
      .getInvite(inviteToken)
      .then((inv) => {
        if (cancelled) return;
        setInviteOk(true);
        setPhone(inv.phone);
        setTradeTitle(inv.occupation);
      })
      .catch((err) => {
        if (cancelled) return;
        setInviteOk(false);
        setInviteError(err instanceof Error ? err.message : "Invalid invite");
      })
      .finally(() => {
        if (!cancelled) setInviteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const canSignup = !!signupsOpen || inviteOk;

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await tradieApi.signupStart({
        businessName,
        tradeTitle: tradeTitle || undefined,
        town: town || undefined,
        phone,
        inviteToken: inviteToken || undefined,
      });
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
      const result = await tradieApi.signupVerify({
        phone,
        code,
        inviteToken: inviteToken || undefined,
      });
      setTradieSession(result.sessionToken);
      if (result.checkoutUrl && !result.checkoutStub) {
        window.location.href = result.checkoutUrl;
        return;
      }
      navigate("/t/settings?billing=start");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  if (signupsOpen === null || inviteLoading) {
    return (
      <div className="tradie-shell t-gate">
        <p className="muted-text">Loading…</p>
      </div>
    );
  }

  if (!canSignup) {
    return (
      <div className="tradie-shell t-gate">
        <div className="t-gate-brand">
          <div className="t-brand-mark">TM</div>
          <h1>Private beta</h1>
          <p>We&apos;re testing with a small group of UK tradies before opening paid trials.</p>
        </div>
        <div className="t-gate-card">
          {inviteError ? (
            <p className="error" style={{ marginTop: 0 }}>
              {inviteError}
            </p>
          ) : (
            <p className="muted-text" style={{ margin: 0 }}>
              New sign-ups are closed for now. Request early access from the homepage, or sign in if you already have an
              account.
            </p>
          )}
          <Link className="primary t-btn--block" to="/" style={{ marginTop: 16, textAlign: "center" }}>
            Request early access
          </Link>
          <Link className="t-btn--block" to="/t/auth" style={{ marginTop: 10, textAlign: "center" }}>
            Sign in
          </Link>
        </div>
        <p className="t-gate-alt">
          <Link to="/">← Back to home</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="tradie-shell t-gate">
      <div className="t-gate-brand">
        <div className="t-brand-mark">TM</div>
        <h1>{inviteOk ? "Create your account" : "Start your 14-day trial"}</h1>
        <p>
          {inviteOk
            ? "Your early access invite is ready. Use the same mobile you applied with."
            : "£14 for 14 days, then £49 every 30 days. Cancel anytime before day 14."}
        </p>
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
                readOnly={inviteOk}
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
              {busy ? "Creating account…" : "Verify & pay £14"}
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
