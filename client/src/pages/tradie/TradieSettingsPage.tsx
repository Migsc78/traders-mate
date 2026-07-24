import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { setTradieSession, tradieApi } from "../../api/tradie";
import { blobToDataUrl, prepareGreetingUpload, preferredRecorderMime } from "../../lib/wav";
import { supportMailto, SUPPORT_EMAIL } from "../../lib/supportMail";
import { StatusPill } from "./ui";

export default function TradieSettingsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const autoCheckoutRef = useRef(false);

  const [businessName, setBusinessName] = useState("");
  const [tradeTitle, setTradeTitle] = useState("");
  const [town, setTown] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [postcode, setPostcode] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [destPhone, setDestPhone] = useState("");
  const [twilioNumber, setTwilioNumber] = useState("");
  const [missedCallMode, setMissedCallMode] = useState<"SMS_QUALIFY" | "VOICEMAIL">("SMS_QUALIFY");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [defaultDepositPercent, setDefaultDepositPercent] = useState(0);

  const [twilioMsg, setTwilioMsg] = useState("");
  const [greetingMsg, setGreetingMsg] = useState("");
  const [recording, setRecording] = useState(false);
  const [connectMsg, setConnectMsg] = useState("");

  useEffect(() => {
    if (!me.data) return;
    setBusinessName(me.data.businessName || "");
    setTradeTitle(me.data.tradeTitle || "");
    setTown(me.data.town || "");
    setAddressLine1(me.data.addressLine1 || "");
    setAddressLine2(me.data.addressLine2 || "");
    setPostcode(me.data.postcode || "");
    setVatNumber(me.data.vatNumber || "");
    setBankName(me.data.bankName || "");
    setBankSortCode(me.data.bankSortCode || "");
    setBankAccountName(me.data.bankAccountName || "");
    setBankAccountNumber(me.data.bankAccountNumber || "");
    setDestPhone(me.data.destPhone || "");
    setTwilioNumber(me.data.twilioNumber || "");
    setMissedCallMode(me.data.missedCallMode || "SMS_QUALIFY");
    setGoogleReviewUrl(me.data.googleReviewUrl || "");
    setDefaultDepositPercent(me.data.defaultDepositPercent || 0);
  }, [me.data]);

  const twilioStatus = useQuery({
    queryKey: ["tradie-twilio-status"],
    queryFn: () => tradieApi.twilioStatus(),
    enabled: !!me.data?.twilioNumber,
    retry: false,
  });

  const save = useMutation({
    mutationFn: (modeOverride?: "SMS_QUALIFY" | "VOICEMAIL") =>
      tradieApi.updateMe({
        businessName,
        tradeTitle: tradeTitle || null,
        town: town || null,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        postcode: postcode || null,
        vatNumber: vatNumber || null,
        bankName: bankName || null,
        bankSortCode: bankSortCode || null,
        bankAccountName: bankAccountName || null,
        bankAccountNumber: bankAccountNumber || null,
        destPhone: destPhone || undefined,
        twilioNumber: twilioNumber || null,
        missedCallMode: modeOverride ?? missedCallMode,
        googleReviewUrl: googleReviewUrl || null,
        defaultDepositPercent,
      }),
    onSuccess: (r: {
      ok: boolean;
      id: string;
      missedCallMode?: "SMS_QUALIFY" | "VOICEMAIL";
      twilioHooks?: { voiceUrl: string; smsUrl: string; alreadyOk: boolean } | null;
      twilioHooksError?: string | null;
    }) => {
      if (r.missedCallMode) setMissedCallMode(r.missedCallMode);
      qc.invalidateQueries({ queryKey: ["tradie-me"] });
      qc.invalidateQueries({ queryKey: ["tradie-twilio-status"] });
      if (r.twilioHooksError) setTwilioMsg(r.twilioHooksError);
      else if (r.twilioHooks) {
        setTwilioMsg(
          r.twilioHooks.alreadyOk
            ? "Twilio voice + SMS webhooks already pointed at TradiesMate."
            : "Twilio voice + SMS webhooks configured."
        );
      } else setTwilioMsg("");
    },
  });

  const configureTwilio = useMutation({
    mutationFn: () => tradieApi.configureTwilio(),
    onSuccess: (r: { alreadyOk: boolean; voiceUrl: string }) => {
      qc.invalidateQueries({ queryKey: ["tradie-twilio-status"] });
      setTwilioMsg(
        r.alreadyOk
          ? "Already configured."
          : `Webhooks set. Voice → ${r.voiceUrl}`
      );
    },
    onError: (e: Error) => setTwilioMsg(e.message),
  });

  const uploadGreeting = useMutation({
    mutationFn: async (blob: Blob) => {
      const prepared = await prepareGreetingUpload(blob);
      const dataUrl = await blobToDataUrl(prepared.blob);
      return tradieApi.uploadGreeting(prepared.contentType, dataUrl);
    },
    onSuccess: () => {
      setGreetingMsg("Greeting saved — callers will hear your voice instead of the robot.");
      qc.invalidateQueries({ queryKey: ["tradie-me"] });
    },
    onError: (e: Error) => setGreetingMsg(e.message),
  });

  const deleteGreeting = useMutation({
    mutationFn: () => tradieApi.deleteGreeting(),
    onSuccess: () => {
      setGreetingMsg("Removed — callers will hear the default text-to-speech greeting.");
      qc.invalidateQueries({ queryKey: ["tradie-me"] });
    },
    onError: (e: Error) => setGreetingMsg(e.message),
  });

  const startGreetingRec = async () => {
    setGreetingMsg("");
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser can't record audio — use Upload WAV/MP3 instead");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = preferredRecorderMime();
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setGreetingMsg("Recording failed — try Upload WAV/MP3 instead");
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || "audio/webm" });
      uploadGreeting.mutate(blob);
    };
    mediaRef.current = rec;
    // Timeslice so mobile browsers actually emit data before stop
    rec.start(250);
    setRecording(true);
  };

  const stopGreetingRec = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const onGreetingFile = async (file: File | null) => {
    if (!file) return;
    setGreetingMsg("");
    uploadGreeting.mutate(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const checkout = useMutation({
    mutationFn: () => tradieApi.billingCheckout(),
    onSuccess: (r: { url: string }) => {
      window.location.href = r.url;
    },
  });

  const portal = useMutation({
    mutationFn: () => tradieApi.billingPortal(),
    onSuccess: (r: { url: string }) => {
      window.location.href = r.url;
    },
  });

  // After signup cancel / incomplete pay — reopen Stripe checkout once.
  useEffect(() => {
    const billing = searchParams.get("billing");
    if (!me.data?.billingRequired) return;
    if (billing !== "start" && billing !== "cancel") return;
    if (autoCheckoutRef.current || checkout.isPending) return;
    autoCheckoutRef.current = true;
    setSearchParams({}, { replace: true });
    checkout.mutate();
  }, [me.data?.billingRequired, searchParams, checkout, setSearchParams]);

  // Refresh account after successful Stripe return.
  useEffect(() => {
    if (searchParams.get("billing") === "success") {
      void qc.invalidateQueries({ queryKey: ["tradie-me"] });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, qc, setSearchParams]);

  const connect = useMutation({
    mutationFn: () => tradieApi.connectOnboard(),
    onSuccess: (r: { ok: boolean; onboarded: boolean; url: string | null }) => {
      qc.invalidateQueries({ queryKey: ["tradie-me"] });
      if (r.onboarded) setConnectMsg("Online payments are enabled.");
      else if (r.url) window.location.href = r.url;
      else setConnectMsg("Could not start Connect onboarding.");
    },
    onError: (e: Error) => setConnectMsg(e.message),
  });

  return (
    <div>
      <header className="t-page-head">
        <h2>Settings</h2>
        <p>Your account, business details, payments, and call rescue</p>
      </header>

      <div className="t-settings-group">
        <p className="t-section-label" style={{ marginTop: 0 }}>Account</p>
        <div className="t-card">
          <dl style={{ margin: 0 }}>
            <div className="t-kv">
              <dt>Status</dt>
              <dd>{me.data?.status ? <StatusPill status={me.data.status} /> : "—"}</dd>
            </div>
            {me.data?.routeKey && (
              <div className="t-kv">
                <dt>Route key</dt>
                <dd><code>{me.data.routeKey}</code></dd>
              </div>
            )}
            {me.data?.inboundEmail && (
              <div className="t-kv">
                <dt>Forward enquiries to</dt>
                <dd><code>{me.data.inboundEmail}</code></dd>
              </div>
            )}
            <div className="t-kv">
              <dt>Pay Now</dt>
              <dd>{me.data?.stripeConnectOnboarded ? "Enabled" : "Not set up"}</dd>
            </div>
          </dl>
          <div className="tradie-actions">
            {me.data?.billingRequired ? (
              <button className="primary t-btn--block" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
                {checkout.isPending
                  ? "Opening…"
                  : `Pay £${((me.data.trialPricePence ?? 1400) / 100).toFixed(0)} — start ${me.data.trialDays ?? 14}-day trial`}
              </button>
            ) : (
              <>
                <button className="primary t-btn--block" onClick={() => portal.mutate()} disabled={portal.isPending}>
                  {portal.isPending ? "Opening…" : "Manage billing / cancel"}
                </button>
                <button type="button" className="t-btn--block" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
                  {checkout.isPending ? "Opening…" : "Update subscription"}
                </button>
              </>
            )}
            <p className="muted-text" style={{ margin: "8px 0 0", fontSize: 13 }}>
              £{((me.data?.trialPricePence ?? 1400) / 100).toFixed(0)} for {me.data?.trialDays ?? 14} days, then £
              {((me.data?.planPricePence ?? 4900) / 100).toFixed(0)} every 30 days. Cancel before day 14 to avoid the
              monthly charge.
            </p>
            <button
              type="button"
              className="t-btn--block"
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
            >
              {connect.isPending
                ? "Opening…"
                : me.data?.stripeConnectOnboarded
                  ? "Refresh payment setup"
                  : "Enable Pay Now (Stripe Connect)"}
            </button>
            {connectMsg && <p className="muted-text">{connectMsg}</p>}
          </div>
        </div>
      </div>

      {me.data?.accountActive && (
        <div className="t-settings-group">
          <p className="t-section-label">Support</p>
          <div className="t-card">
            <p className="muted-text" style={{ margin: "0 0 12px" }}>
              Need help with your account, number, quotes, or billing? Email us and we&apos;ll treat
              it as a support ticket.
            </p>
            <a
              className="primary t-btn--block"
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
              href={supportMailto({
                businessName: me.data.businessName,
                routeKey: me.data.routeKey,
              })}
            >
              Email {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      )}

      <div className="t-settings-group">
        <p className="t-section-label">Business</p>
        <div className="t-card">
          <div className="form">
            <label>
              Business name
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            </label>
            <label>
              Trade
              <input value={tradeTitle} onChange={(e) => setTradeTitle(e.target.value)} placeholder="Plumber" />
            </label>
            <label>
              Address line 1
              <input
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="12 High Street"
              />
            </label>
            <label>
              Address line 2
              <input
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              Town
              <input value={town} onChange={(e) => setTown(e.target.value)} placeholder="Woking" />
            </label>
            <label>
              Business postcode
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="GU21 6AA"
              />
              <span className="muted-text" style={{ fontWeight: 400 }}>
                Used to show how far each job is from you.
              </span>
            </label>
            <label>
              VAT number
              <input
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                placeholder="GB123456789"
              />
              <span className="muted-text" style={{ fontWeight: 400 }}>
                Shown on invoices when set.
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="t-settings-group">
        <p className="t-section-label">Bank details — shown on invoices</p>
        <div className="t-card">
          <div className="form">
            <label>
              Bank name
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </label>
            <label>
              Account name
              <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} />
            </label>
            <label>
              Sort code
              <input value={bankSortCode} onChange={(e) => setBankSortCode(e.target.value)} placeholder="00-00-00" />
            </label>
            <label>
              Account number
              <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
            </label>
          </div>
        </div>
      </div>

      <div className="t-settings-group">
        <p className="t-section-label">Reviews & deposits</p>
        <div className="t-card">
          <div className="form">
            <label>
              Google review link
              <input
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                placeholder="https://g.page/r/…"
              />
              <span className="muted-text" style={{ fontWeight: 400 }}>
                Customers get this by SMS after you mark an invoice paid.
              </span>
            </label>
            <label>
              Default deposit on quotes (%)
              <input
                type="number"
                min={0}
                max={100}
                value={defaultDepositPercent}
                onChange={(e) => setDefaultDepositPercent(Number(e.target.value) || 0)}
              />
              <span className="muted-text" style={{ fontWeight: 400 }}>
                0 = off. Requires Pay Now (Stripe Connect) so customers can pay the deposit on accept.
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="t-settings-group">
        <p className="t-section-label">Missed-call rescue</p>
        <div className="t-card">
          <p className="muted-text" style={{ margin: "0 0 12px" }}>
            Save your Twilio number, then tap <strong>Wire voice &amp; SMS</strong> so callers hear your greeting and get
            a text-back (not Twilio&apos;s default “set up voice” message). After that, dial the divert codes once on
            your phone.
          </p>
          <label>
            Your mobile — job alerts
            <input
              value={destPhone}
              onChange={(e) => setDestPhone(e.target.value)}
              placeholder="+447700900123"
            />
            <span className="muted-text" style={{ fontWeight: 400 }}>
              New jobs from missed calls / voicemail are texted here.
            </span>
          </label>
          <label>
            Twilio number (E.164)
            <input value={twilioNumber} onChange={(e) => setTwilioNumber(e.target.value)} placeholder="+447700149777" />
          </label>

          {me.data?.twilioNumber && (
            <p className="muted-text" style={{ marginTop: 10 }}>
              Webhooks:{" "}
              {twilioStatus.isLoading
                ? "checking…"
                : twilioStatus.data?.configured
                  ? "✅ Voice + SMS pointed at TradiesMate"
                  : twilioStatus.data?.found === false
                    ? "⚠️ Number not found on this Twilio account"
                    : twilioStatus.data?.voiceOk === false
                      ? "⚠️ Voice URL not set — tap Wire voice & SMS"
                      : "⚠️ Not fully configured"}
            </p>
          )}

          <div className="tradie-actions">
            <button
              type="button"
              className="primary"
              disabled={!twilioNumber.trim() || configureTwilio.isPending || save.isPending}
              onClick={() => {
                setTwilioMsg("");
                if (twilioNumber.trim() !== (me.data?.twilioNumber || "")) {
                  save.mutate(undefined, {
                    onSuccess: () => configureTwilio.mutate(),
                  });
                } else {
                  configureTwilio.mutate();
                }
              }}
            >
              {configureTwilio.isPending ? "Wiring…" : "Wire voice & SMS"}
            </button>
          </div>
          {twilioMsg && (
            <p className={configureTwilio.isError || save.data?.twilioHooksError ? "error" : "muted-text"} style={{ marginTop: 8 }}>
              {twilioMsg}
            </p>
          )}

          {me.data?.divertCodes && (
            <>
              <ul className="t-divert-list">
                <li><span>No answer</span> <code>{me.data.divertCodes.noAnswer}</code></li>
                <li><span>Busy</span> <code>{me.data.divertCodes.busy}</code></li>
                <li><span>Off / no signal</span> <code>{me.data.divertCodes.unreachable}</code></li>
              </ul>
              <p className="muted-text" style={{ marginTop: 8 }}>
                Dial on your work mobile. If &quot;Off / no signal&quot; fails with a network error, skip it — No answer + Busy
                still catch most missed calls. Weak signal often blocks unreachable divert.
              </p>
              <p className="muted-text" style={{ marginTop: 8 }}>
                Wrong number or want it off? Dial <code>##002#</code> to cancel all conditional divert.
              </p>
            </>
          )}

          <p className="t-section-label" style={{ marginTop: 18 }}>After the greeting</p>
          <div className="t-mode-toggle" role="radiogroup" aria-label="Missed-call rescue mode">
            <button
              type="button"
              role="radio"
              aria-checked={missedCallMode === "SMS_QUALIFY"}
              className={missedCallMode === "SMS_QUALIFY" ? "on" : ""}
              disabled={save.isPending}
              onClick={() => {
                setMissedCallMode("SMS_QUALIFY");
                save.mutate("SMS_QUALIFY");
              }}
            >
              <strong>Text them back</strong>
              <span>We SMS the caller for the job and postcode (default).</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={missedCallMode === "VOICEMAIL"}
              className={missedCallMode === "VOICEMAIL" ? "on" : ""}
              disabled={me.data?.caps?.whisper === false || save.isPending}
              onClick={() => {
                setMissedCallMode("VOICEMAIL");
                save.mutate("VOICEMAIL");
              }}
            >
              <strong>Caller leaves a voicemail</strong>
              <span>
                They say name, job and postcode after the beep — we turn it into a job card and text you.
                {me.data?.caps?.whisper === false ? " (Needs Whisper configured on the server.)" : ""}
              </span>
            </button>
          </div>
          <p className="muted-text" style={{ margin: "8px 0 0" }}>
            {save.isPending
              ? "Saving rescue mode…"
              : missedCallMode === "VOICEMAIL"
                ? "Voicemail mode is on — callers will hear a beep after your greeting."
                : "Text-back mode is on — callers get an SMS after your greeting."}
          </p>
        </div>
      </div>

      <div className="t-settings-group">
        <p className="t-section-label">Missed-call greeting</p>
        <div className="t-card">
          <p className="muted-text" style={{ margin: "0 0 12px" }}>
            Record a short message in your own voice (about 10–15 seconds). Callers hear this instead of the default
            robot voice.{" "}
            {missedCallMode === "VOICEMAIL"
              ? `Example: “Hi, you've reached ${businessName || "us"} — leave your name, what you need and your postcode after the beep.” (We'll beep straight after your recording — no robot voice.)`
              : `Example: “Hi, you've reached ${businessName || "us"} — text us your name and job and we'll get back ASAP.”`}
          </p>

          {me.data?.greetingAudioUrl ? (
            <div className="t-greeting-preview">
              <audio controls src={me.data.greetingAudioUrl} preload="metadata" />
              <p className="muted-text" style={{ margin: "8px 0 0" }}>
                Your greeting is active.
              </p>
            </div>
          ) : (
            <p className="muted-text" style={{ margin: "0 0 12px" }}>
              No custom greeting yet — callers hear text-to-speech until you record one.
            </p>
          )}

          <div className="tradie-actions" style={{ marginTop: 12 }}>
            {!recording ? (
              <button
                type="button"
                className="primary"
                disabled={uploadGreeting.isPending}
                onClick={() => void startGreetingRec().catch((e) => setGreetingMsg(e instanceof Error ? e.message : "Mic failed"))}
              >
                {uploadGreeting.isPending ? "Saving…" : "Record greeting"}
              </button>
            ) : (
              <button type="button" className="danger" onClick={stopGreetingRec}>
                Stop &amp; save
              </button>
            )}
            <button
              type="button"
              disabled={uploadGreeting.isPending || recording}
              onClick={() => fileRef.current?.click()}
            >
              Upload WAV/MP3
            </button>
            {me.data?.greetingAudioUrl && (
              <button
                type="button"
                className="linkish"
                disabled={deleteGreeting.isPending}
                onClick={() => {
                  if (confirm("Remove your greeting and use the default robot voice?")) {
                    deleteGreeting.mutate();
                  }
                }}
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp3,.wav,.mp3"
              hidden
              onChange={(e) => void onGreetingFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {greetingMsg && (
            <p className={uploadGreeting.isError || deleteGreeting.isError ? "error" : "muted-text"} style={{ marginTop: 8 }}>
              {greetingMsg}
            </p>
          )}
        </div>
      </div>

      <div className="t-save-bar">
        <button
          className="primary t-btn--block"
          onClick={() => save.mutate(undefined)}
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
        {save.isError && <p className="error">{(save.error as Error).message}</p>}
        {save.isSuccess && <p className="muted-text" style={{ textAlign: "center" }}>Saved.</p>}
        <button
          className="linkish"
          onClick={() => {
            setTradieSession(null);
            window.location.href = "/t/auth";
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
