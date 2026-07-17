import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setTradieSession, tradieApi } from "../../api/tradie";
import { StatusPill } from "./ui";

export default function TradieSettingsPage() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["tradie-me"], queryFn: () => tradieApi.me() });

  const [businessName, setBusinessName] = useState("");
  const [tradeTitle, setTradeTitle] = useState("");
  const [town, setTown] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankSortCode, setBankSortCode] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [twilioNumber, setTwilioNumber] = useState("");

  const [twilioMsg, setTwilioMsg] = useState("");

  useEffect(() => {
    if (!me.data) return;
    setBusinessName(me.data.businessName || "");
    setTradeTitle(me.data.tradeTitle || "");
    setTown(me.data.town || "");
    setBankName(me.data.bankName || "");
    setBankSortCode(me.data.bankSortCode || "");
    setBankAccountName(me.data.bankAccountName || "");
    setBankAccountNumber(me.data.bankAccountNumber || "");
    setTwilioNumber(me.data.twilioNumber || "");
  }, [me.data]);

  const twilioStatus = useQuery({
    queryKey: ["tradie-twilio-status"],
    queryFn: () => tradieApi.twilioStatus(),
    enabled: !!me.data?.twilioNumber,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () =>
      tradieApi.updateMe({
        businessName,
        tradeTitle: tradeTitle || null,
        town: town || null,
        bankName: bankName || null,
        bankSortCode: bankSortCode || null,
        bankAccountName: bankAccountName || null,
        bankAccountNumber: bankAccountNumber || null,
        twilioNumber: twilioNumber || null,
      }),
    onSuccess: (r: {
      ok: boolean;
      id: string;
      twilioHooks?: { voiceUrl: string; smsUrl: string; alreadyOk: boolean } | null;
      twilioHooksError?: string | null;
    }) => {
      qc.invalidateQueries({ queryKey: ["tradie-me"] });
      qc.invalidateQueries({ queryKey: ["tradie-twilio-status"] });
      if (r.twilioHooksError) setTwilioMsg(r.twilioHooksError);
      else if (r.twilioHooks) {
        setTwilioMsg(
          r.twilioHooks.alreadyOk
            ? "Twilio voice + SMS webhooks already pointed at TradersMate."
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

  const checkout = useMutation({
    mutationFn: () => tradieApi.billingCheckout(),
    onSuccess: (r: { url: string }) => window.open(r.url, "_blank"),
  });

  return (
    <div>
      <header className="t-page-head">
        <h2>Settings</h2>
        <p>Your account, business details, and call rescue</p>
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
          </dl>
          <div className="tradie-actions">
            <button className="primary t-btn--block" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
              {checkout.isPending ? "Opening…" : "Subscribe / manage billing"}
            </button>
          </div>
        </div>
      </div>

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
              Town
              <input value={town} onChange={(e) => setTown(e.target.value)} placeholder="Woking" />
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
        <p className="t-section-label">Missed-call rescue</p>
        <div className="t-card">
          <p className="muted-text" style={{ margin: "0 0 12px" }}>
            Save your Twilio number, then tap <strong>Wire voice &amp; SMS</strong> so callers hear our TTS and get a
            text-back (not Twilio&apos;s default “set up voice” message). After that, dial the divert codes once on your
            phone.
          </p>
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
                  ? "✅ Voice + SMS pointed at TradersMate"
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
            <ul className="t-divert-list">
              <li><span>No answer</span> <code>{me.data.divertCodes.noAnswer}</code></li>
              <li><span>Busy</span> <code>{me.data.divertCodes.busy}</code></li>
              <li><span>Off / no signal</span> <code>{me.data.divertCodes.unreachable}</code></li>
            </ul>
          )}
        </div>
      </div>

      <div className="t-save-bar">
        <button className="primary t-btn--block" onClick={() => save.mutate()} disabled={save.isPending}>
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
