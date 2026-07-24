import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tradieApi } from "../../api/tradie";
import { DivertManualGuide } from "./DivertManualGuide";

const STEPS = [
  "Welcome",
  "Your number",
  "Divert calls",
  "Test it",
  "Job alerts",
  "Rates",
  "Get paid",
] as const;

type TradePreset = "plumber" | "electrician" | "heating";

const RATE_PREVIEWS: Record<
  TradePreset,
  { label: string; unit: string; unitPricePence: number; isCallout?: boolean }[]
> = {
  plumber: [
    { label: "Call-out / first hour", unit: "JOB", unitPricePence: 8500, isCallout: true },
    { label: "Labour (additional hour)", unit: "HOUR", unitPricePence: 5500 },
    { label: "Combi boiler swap (labour only)", unit: "JOB", unitPricePence: 65000 },
    { label: "Radiator swap", unit: "EACH", unitPricePence: 12000 },
    { label: "Tap fit / replace", unit: "EACH", unitPricePence: 7500 },
    { label: "Toilet replace", unit: "JOB", unitPricePence: 18000 },
  ],
  electrician: [
    { label: "Call-out / first hour", unit: "JOB", unitPricePence: 9000, isCallout: true },
    { label: "Labour (additional hour)", unit: "HOUR", unitPricePence: 6000 },
    { label: "Consumer unit upgrade (labour)", unit: "JOB", unitPricePence: 45000 },
    { label: "Additional socket", unit: "EACH", unitPricePence: 8500 },
    { label: "EICR (up to 10 circuits)", unit: "JOB", unitPricePence: 18000 },
    { label: "Light fitting install", unit: "EACH", unitPricePence: 6500 },
  ],
  heating: [
    { label: "Call-out / first hour", unit: "JOB", unitPricePence: 8500, isCallout: true },
    { label: "Labour (additional hour)", unit: "HOUR", unitPricePence: 5500 },
    { label: "Boiler service", unit: "JOB", unitPricePence: 9500 },
    { label: "Combi boiler swap (labour only)", unit: "JOB", unitPricePence: 65000 },
    { label: "TRV fit", unit: "EACH", unitPricePence: 4500 },
    { label: "Powerflush", unit: "JOB", unitPricePence: 35000 },
  ],
};

function gbp(pence: number) {
  return `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`;
}

/** Format typed digits into XX-XX-XX as the user types. */
function formatSortCodeInput(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function formatAccountNumberInput(raw: string) {
  return raw.replace(/\D/g, "").slice(0, 8);
}

export default function TradieOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const onboarding = useQuery({
    queryKey: ["tradie-onboarding"],
    queryFn: () => tradieApi.onboarding(),
    refetchInterval: (q: { state: { data?: { step: number; testCallDetected?: boolean } } }) =>
      q.state.data?.step === 3 && !q.state.data?.testCallDetected ? 4000 : false,
  });

  const [destPhone, setDestPhone] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [msg, setMsg] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [alertSent, setAlertSent] = useState(false);
  const [tradePreset, setTradePreset] = useState<TradePreset>("plumber");
  const [ratesMsg, setRatesMsg] = useState("");
  const [ratesReady, setRatesReady] = useState(false);
  const [bankMsg, setBankMsg] = useState("");
  const [bankSaved, setBankSaved] = useState(false);
  const [connectMsg, setConnectMsg] = useState("");

  useEffect(() => {
    if (!onboarding.data) return;
    setDestPhone(onboarding.data.destPhone || "");
    setBankName(onboarding.data.bank.bankName || "");
    setBankSortCode(onboarding.data.bank.bankSortCode || "");
    setBankAccountName(onboarding.data.bank.bankAccountName || "");
    setBankAccountNumber(onboarding.data.bank.bankAccountNumber || "");
    setTradePreset(onboarding.data.tradePreset || "plumber");
    setRatesReady(!!onboarding.data.hasRates);
    setBankSaved(!!onboarding.data.hasBankDetails);
    if (onboarding.data.step !== 4) {
      setAlertMsg("");
      setAlertSent(false);
    }
    if (onboarding.data.step !== 5) {
      setRatesMsg("");
    }
    if (onboarding.data.step !== 6) {
      setBankMsg("");
      setConnectMsg("");
    }
  }, [onboarding.data]);

  useEffect(() => {
    if (onboarding.data?.completed) navigate("/t", { replace: true });
  }, [onboarding.data?.completed, navigate]);

  // When a test call arrives on step 3, keep UI fresh (poll already running)
  useEffect(() => {
    if (onboarding.data?.step === 3 && onboarding.data.testCallDetected) {
      void qc.invalidateQueries({ queryKey: ["tradie-me"] });
    }
  }, [onboarding.data?.step, onboarding.data?.testCallDetected, qc]);

  // Stripe Connect return from hosted onboarding
  useEffect(() => {
    const connect = searchParams.get("connect");
    if (connect !== "return" && connect !== "refresh") return;
    let cancelled = false;
    void (async () => {
      try {
        const status = await tradieApi.connectStatus();
        if (cancelled) return;
        if (status.onboarded || status.chargesEnabled) {
          setConnectMsg("Pay Now is enabled — customers can pay card deposits.");
        } else if (connect === "refresh") {
          setConnectMsg("Stripe setup was interrupted — tap Enable Pay Now to continue.");
        } else {
          setConnectMsg("Stripe details submitted — finishing verification. You can continue.");
        }
        await qc.invalidateQueries({ queryKey: ["tradie-onboarding"] });
        await qc.invalidateQueries({ queryKey: ["tradie-me"] });
      } catch (e) {
        if (!cancelled) setConnectMsg(e instanceof Error ? e.message : "Could not check Pay Now status");
      } finally {
        if (!cancelled) {
          const next = new URLSearchParams(searchParams);
          next.delete("connect");
          setSearchParams(next, { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams, qc]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["tradie-onboarding"] });
    await qc.invalidateQueries({ queryKey: ["tradie-me"] });
  };

  const setStep = useMutation({
    mutationFn: (step: number) => tradieApi.onboardingStep({ step }),
    onSuccess: refresh,
  });

  const advance = useMutation({
    mutationFn: () => tradieApi.onboardingStep({ advance: true }),
    onSuccess: refresh,
  });

  const provision = useMutation({
    mutationFn: () => tradieApi.onboardingProvisionNumber(),
    onSuccess: async () => {
      setMsg("");
      await refresh();
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const confirmDivert = useMutation({
    mutationFn: () => tradieApi.onboardingConfirmDivert(),
    onSuccess: refresh,
  });

  const confirmTest = useMutation({
    mutationFn: () => tradieApi.onboardingConfirmTest(),
    onSuccess: refresh,
  });

  const saveAlerts = useMutation({
    mutationFn: () => tradieApi.onboardingAlerts(destPhone),
    onSuccess: () => {
      setAlertMsg("");
      void refresh();
    },
    onError: (e: Error) => setAlertMsg(e.message),
  });

  const testAlert = useMutation({
    mutationFn: () => tradieApi.onboardingTestAlert(destPhone.trim() || undefined),
    onSuccess: (r: { ok: boolean; to: string }) => {
      setAlertSent(true);
      setAlertMsg(`Test alert sent to ${r.to}`);
    },
    onError: (e: Error) => {
      setAlertSent(false);
      setAlertMsg(e.message);
    },
  });

  const seedRates = useMutation({
    mutationFn: () => tradieApi.onboardingSeedRates(tradePreset),
    onSuccess: (r: {
      seeded: number;
      alreadyHad: boolean;
      count: number;
    }) => {
      setRatesReady(true);
      if (r.alreadyHad) {
        setRatesMsg(`You already have ${r.count} rates — edit anytime in Rates.`);
      } else {
        setRatesMsg(`Loaded ${r.seeded} starter rates for your trade.`);
      }
      void refresh();
    },
    onError: (e: Error) => {
      setRatesReady(false);
      setRatesMsg(e.message);
    },
  });

  const confirmRates = useMutation({
    mutationFn: () => tradieApi.onboardingConfirmRates(),
    onSuccess: refresh,
  });

  const saveBank = useMutation({
    mutationFn: () =>
      tradieApi.onboardingBank({ bankName, bankSortCode, bankAccountName, bankAccountNumber }),
    onSuccess: () => {
      setBankSaved(true);
      setBankMsg("Bank details saved — they’ll show on invoices.");
      void refresh();
    },
    onError: (e: Error) => {
      setBankSaved(false);
      setBankMsg(e.message);
    },
  });

  const complete = useMutation({
    mutationFn: async (opts?: { saveBank?: boolean }) => {
      const looksComplete =
        !!bankAccountName.trim() &&
        bankSortCode.replace(/\D/g, "").length === 6 &&
        bankAccountNumber.replace(/\D/g, "").length === 8;
      if (opts?.saveBank !== false && looksComplete && !bankSaved) {
        await tradieApi.onboardingBank({ bankName, bankSortCode, bankAccountName, bankAccountNumber });
      }
      return tradieApi.onboardingComplete();
    },
    onSuccess: async () => {
      await refresh();
      navigate("/t", { replace: true });
    },
    onError: (e: Error) => setBankMsg(e.message),
  });

  const connect = useMutation({
    mutationFn: () =>
      tradieApi.connectOnboard({
        returnPath: "/t/onboarding?connect=return",
        refreshPath: "/t/onboarding?connect=refresh",
      }),
    onSuccess: (r: { ok: boolean; onboarded: boolean; url: string | null }) => {
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setConnectMsg("Pay Now is enabled — customers can pay card deposits.");
      void refresh();
    },
    onError: (e: Error) => setConnectMsg(e.message),
  });

  if (onboarding.isLoading || !onboarding.data) {
    return (
      <div className="t-onboard">
        <p className="muted-text">Loading setup…</p>
      </div>
    );
  }

  const d = onboarding.data;
  const step = d.step;
  const pct = Math.round(((step + (d.completed ? 1 : 0)) / (d.lastStep + 1)) * 100);

  return (
    <div className="t-onboard">
      <header className="t-onboard-head">
        <p className="t-section-label">Setup</p>
        <h2>{STEPS[step] || "Setup"}</h2>
        <div className="t-onboard-progress" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="muted-text t-onboard-steps">
          Step {step + 1} of {d.lastStep + 1}
        </p>
      </header>

      <div className="t-card t-onboard-card">
        {step === 0 && (
          <>
            <p>
              Welcome, <strong>{d.businessName}</strong>. You&apos;ve got{" "}
              <strong>£{(d.trialPricePence / 100).toFixed(0)}</strong> for{" "}
              <strong>{d.trialDays} days</strong>, then £{(d.planPricePence / 100).toFixed(0)} every 30 days unless
              you cancel.
            </p>
            <p className="muted-text">Next we&apos;ll set up missed-call rescue so you stop losing jobs.</p>
            <button className="primary t-btn--block" type="button" onClick={() => advance.mutate()} disabled={advance.isPending}>
              Let&apos;s go
            </button>
          </>
        )}

        {step === 1 && (
          <>
            {d.hasNumber ? (
              <>
                <p>Your TradiesMate number is ready:</p>
                <p className="t-onboard-number">{d.twilioNumber}</p>
                <p className="muted-text">Callers who miss you will reach this number when divert is on.</p>
                <button className="primary t-btn--block" type="button" onClick={() => advance.mutate()}>
                  Continue
                </button>
              </>
            ) : (
              <>
                <p>We&apos;re assigning a UK number for missed-call rescue.</p>
                {msg && <p className="error">{msg}</p>}
                <button
                  className="primary t-btn--block"
                  type="button"
                  onClick={() => provision.mutate()}
                  disabled={provision.isPending}
                >
                  {provision.isPending ? "Getting number…" : "Get my number"}
                </button>
                <button type="button" className="linkish" onClick={() => advance.mutate()}>
                  Skip for now
                </button>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <p>Dial these once on your <strong>work mobile</strong> (the phone that rings for jobs). These codes go to your network — not to us:</p>
            {d.divertCodes ? (
              <ul className="t-divert-list">
                <li>
                  <span>No answer</span> <code>{d.divertCodes.noAnswer}</code>
                </li>
                <li>
                  <span>Busy</span> <code>{d.divertCodes.busy}</code>
                </li>
                <li>
                  <span>Off / no signal</span> <code>{d.divertCodes.unreachable}</code>
                </li>
              </ul>
            ) : (
              <p className="error">No number yet — go back and get a number first.</p>
            )}
            <p className="muted-text">
              Tip: do <strong>No answer</strong> and <strong>Busy</strong> first — those cover most missed calls.
              If &quot;Off / no signal&quot; fails with a network error, skip it (common on weak signal).
            </p>
            <p className="muted-text">To cancel divert later: ##002#</p>
            <DivertManualGuide twilioNumber={d.twilioNumber} />
            <button
              className="primary t-btn--block"
              type="button"
              disabled={!d.divertCodes || confirmDivert.isPending}
              onClick={() => confirmDivert.mutate()}
            >
              I&apos;ve set divert
            </button>
            <button type="button" className="linkish" onClick={() => setStep.mutate(1)}>
              Back
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <ol className="t-onboard-ol">
              <li>
                From a <strong>different</strong> phone, call your work mobile
                {d.destPhone ? ` (${d.destPhone})` : ""}.
              </li>
              <li>
                Let it ring — <strong>don&apos;t answer</strong>.
              </li>
              <li>
                Divert should send the call to{" "}
                <strong>{d.twilioNumber || "your TradiesMate number"}</strong>.
              </li>
            </ol>
            {d.testCallDetected ? (
              <p className="t-onboard-ok">
                Test call received
                {d.recentMissedCalls > 0 ? ` (${d.recentMissedCalls})` : ""}. Missed-call rescue is working.
              </p>
            ) : (
              <p className="t-onboard-listening" aria-live="polite">
                Listening for a test call… keep this screen open.
              </p>
            )}
            <button
              className="primary t-btn--block"
              type="button"
              onClick={() => confirmTest.mutate()}
              disabled={confirmTest.isPending}
            >
              {d.testCallDetected ? "Continue" : "I've tested it — continue"}
            </button>
            {!d.testCallDetected && (
              <button type="button" className="linkish" onClick={() => confirmTest.mutate()}>
                Skip test for now
              </button>
            )}
            <button type="button" className="linkish" onClick={() => setStep.mutate(2)}>
              Back
            </button>
          </>
        )}

        {step === 4 && (
          <>
            <p>
              When a missed call turns into a job, we text <strong>you</strong> here — not the customer.
            </p>
            <label>
              Mobile for job alerts
              <input
                value={destPhone}
                onChange={(e) => {
                  setDestPhone(e.target.value);
                  setAlertSent(false);
                  setAlertMsg("");
                }}
                placeholder="07…"
                inputMode="tel"
                autoComplete="tel"
              />
            </label>
            <p className="muted-text" style={{ marginTop: 0 }}>
              Use the phone you actually check on the van. UK mobiles work best (07… or +44…).
            </p>
            {alertMsg && (
              <p className={alertSent ? "t-onboard-ok" : "error"} style={{ marginTop: 0 }}>
                {alertMsg}
              </p>
            )}
            <button
              type="button"
              className="t-btn--block"
              onClick={() => testAlert.mutate()}
              disabled={!destPhone.trim() || testAlert.isPending}
            >
              {testAlert.isPending ? "Sending…" : alertSent ? "Send another test" : "Send me a test alert"}
            </button>
            <button
              className="primary t-btn--block"
              type="button"
              onClick={() => saveAlerts.mutate()}
              disabled={!destPhone.trim() || saveAlerts.isPending}
            >
              {saveAlerts.isPending ? "Saving…" : "Looks good — continue"}
            </button>
            <button type="button" className="linkish" onClick={() => setStep.mutate(3)}>
              Back
            </button>
          </>
        )}

        {step === 5 && (
          <>
            <p>
              Voice quotes pull prices from your rate book. Pick your trade and we&apos;ll load starter
              rates — change any figure later in Rates.
            </p>
            {!ratesReady && (
              <div className="t-onboard-presets" role="group" aria-label="Trade">
                {(
                  d.tradePresets?.length
                    ? d.tradePresets
                    : ([
                        { id: "plumber", label: "Plumber" },
                        { id: "electrician", label: "Electrician" },
                        { id: "heating", label: "Heating / gas" },
                      ] as { id: TradePreset; label: string }[])
                ).map((p: { id: TradePreset; label: string }) => (
                  <button
                    key={p.id}
                    type="button"
                    className={tradePreset === p.id ? "t-onboard-preset is-active" : "t-onboard-preset"}
                    onClick={() => {
                      setTradePreset(p.id);
                      setRatesMsg("");
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <ul className="t-onboard-rates">
              {(ratesReady && d.ratePreview?.length
                ? d.ratePreview
                : RATE_PREVIEWS[tradePreset]
              ).map(
                (row: {
                  label: string;
                  unit: string;
                  unitPricePence: number;
                  isCallout?: boolean | null;
                }) => (
                <li key={`${row.label}-${row.unitPricePence}`}>
                  <span>
                    {row.label}
                    {row.isCallout ? <em className="muted-text"> · call-out</em> : null}
                  </span>
                  <strong>
                    {gbp(row.unitPricePence)}
                    <span className="muted-text"> / {row.unit.toLowerCase()}</span>
                  </strong>
                </li>
              )
              )}
            </ul>
            <p className="muted-text" style={{ marginTop: 0 }}>
              Starter figures only — tweak to match what you actually charge.
            </p>
            {ratesMsg && (
              <p className={ratesReady ? "t-onboard-ok" : "error"} style={{ marginTop: 0 }}>
                {ratesMsg}
              </p>
            )}
            {ratesReady && !ratesMsg && d.priceBookCount > 0 && (
              <p className="t-onboard-ok" style={{ marginTop: 0 }}>
                You already have {d.priceBookCount} rates ready.
              </p>
            )}
            {!ratesReady ? (
              <button
                className="primary t-btn--block"
                type="button"
                onClick={() => seedRates.mutate()}
                disabled={seedRates.isPending}
              >
                {seedRates.isPending ? "Loading…" : "Load these starter rates"}
              </button>
            ) : (
              <button
                className="primary t-btn--block"
                type="button"
                onClick={() => confirmRates.mutate()}
                disabled={confirmRates.isPending}
              >
                {confirmRates.isPending ? "Saving…" : "Looks good — continue"}
              </button>
            )}
            {ratesReady && (
              <Link to="/t/price-book" className="t-btn--block t-onboard-secondary">
                Edit rates now
              </Link>
            )}
            <button type="button" className="linkish" onClick={() => setStep.mutate(6)}>
              Skip for now
            </button>
            <button type="button" className="linkish" onClick={() => setStep.mutate(4)}>
              Back
            </button>
          </>
        )}

        {step === 6 && (
          <>
            <p>
              Optional — add bank details for BACS on invoices, and/or enable card deposits with Pay Now.
              You can finish without either.
            </p>

            <h3 className="t-onboard-subhead">Bank transfer (invoices)</h3>
            <div className="form">
              <label>
                Account name
                <input
                  value={bankAccountName}
                  onChange={(e) => {
                    setBankAccountName(e.target.value);
                    setBankSaved(false);
                    setBankMsg("");
                  }}
                  autoComplete="name"
                  placeholder="As on the account"
                />
              </label>
              <label>
                Sort code
                <input
                  value={bankSortCode}
                  onChange={(e) => {
                    setBankSortCode(formatSortCodeInput(e.target.value));
                    setBankSaved(false);
                    setBankMsg("");
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="00-00-00"
                />
              </label>
              <label>
                Account number
                <input
                  value={bankAccountNumber}
                  onChange={(e) => {
                    setBankAccountNumber(formatAccountNumberInput(e.target.value));
                    setBankSaved(false);
                    setBankMsg("");
                  }}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="8 digits"
                />
              </label>
              <label>
                Bank name <span className="muted-text">(optional)</span>
                <input
                  value={bankName}
                  onChange={(e) => {
                    setBankName(e.target.value);
                    setBankSaved(false);
                    setBankMsg("");
                  }}
                  placeholder="e.g. Barclays"
                />
              </label>
            </div>
            {bankMsg && (
              <p className={bankSaved ? "t-onboard-ok" : "error"} style={{ marginTop: 0 }}>
                {bankMsg}
              </p>
            )}
            {bankSaved && !bankMsg && (
              <p className="t-onboard-ok" style={{ marginTop: 0 }}>
                Bank details on file.
              </p>
            )}
            <button
              className="t-btn--block"
              type="button"
              onClick={() => saveBank.mutate()}
              disabled={
                saveBank.isPending ||
                (!bankAccountName.trim() && !bankSortCode.trim() && !bankAccountNumber.trim() && !bankName.trim())
              }
            >
              {saveBank.isPending ? "Saving…" : bankSaved ? "Update bank details" : "Save bank details"}
            </button>

            <h3 className="t-onboard-subhead">Card deposits (Pay Now)</h3>
            <p className="muted-text" style={{ marginTop: 0 }}>
              Lets customers pay a deposit on quotes/invoices by card. Takes a couple of minutes with Stripe.
            </p>
            {connectMsg && (
              <p
                className={
                  d.stripeConnectOnboarded || connectMsg.startsWith("Pay Now is enabled")
                    ? "t-onboard-ok"
                    : connectMsg.toLowerCase().includes("interrupted") || connectMsg.toLowerCase().includes("could not")
                      ? "error"
                      : "muted-text"
                }
                style={{ marginTop: 0 }}
              >
                {connectMsg}
              </p>
            )}
            {d.stripeConnectOnboarded && !connectMsg && (
              <p className="t-onboard-ok" style={{ marginTop: 0 }}>
                Pay Now is enabled.
              </p>
            )}
            <button
              type="button"
              className="t-btn--block"
              onClick={() => {
                setConnectMsg("");
                connect.mutate();
              }}
              disabled={connect.isPending || d.stripeConnectOnboarded}
            >
              {connect.isPending
                ? "Opening Stripe…"
                : d.stripeConnectOnboarded
                  ? "Pay Now enabled"
                  : "Enable Pay Now"}
            </button>

            <button
              className="primary t-btn--block"
              type="button"
              style={{ marginTop: 16 }}
              onClick={() => complete.mutate({ saveBank: true })}
              disabled={complete.isPending}
            >
              {complete.isPending ? "Finishing…" : "Finish setup — go to jobs"}
            </button>
            <button
              type="button"
              className="linkish"
              onClick={() => complete.mutate({ saveBank: false })}
              disabled={complete.isPending}
            >
              Skip &amp; go to jobs
            </button>
            <button type="button" className="linkish" onClick={() => setStep.mutate(5)}>
              Back
            </button>
          </>
        )}
      </div>

      <p className="t-gate-alt">
        <Link to="/t/settings">Open Settings</Link>
        {" · "}
        <button type="button" className="linkish" onClick={() => complete.mutate({ saveBank: false })}>
          Finish later
        </button>
      </p>
    </div>
  );
}
