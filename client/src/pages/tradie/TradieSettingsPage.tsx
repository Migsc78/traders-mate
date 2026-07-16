import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setTradieSession, tradieApi } from "../../api/tradie";

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradie-me"] }),
  });

  const checkout = useMutation({
    mutationFn: () => tradieApi.billingCheckout(),
    onSuccess: (r: { url: string }) => window.open(r.url, "_blank"),
  });

  return (
    <div>
      <h2>Settings</h2>

      <section className="client-section">
        <h3>Account</h3>
        <p className="muted-text">
          Status: <strong>{me.data?.status}</strong>
          {me.data?.routeKey ? (
            <>
              {" "}
              · Route key: <code>{me.data.routeKey}</code>
            </>
          ) : null}
        </p>
        {me.data?.inboundEmail && (
          <p className="muted-text">
            Forward website enquiries to: <code>{me.data.inboundEmail}</code>
          </p>
        )}
        <button className="primary" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
          {checkout.isPending ? "Opening…" : "Subscribe / manage billing"}
        </button>
      </section>

      <section className="client-section" style={{ marginTop: 24 }}>
        <h3>Business</h3>
        <div className="form">
          <label>
            Business name
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </label>
          <label>
            Trade
            <input value={tradeTitle} onChange={(e) => setTradeTitle(e.target.value)} />
          </label>
          <label>
            Town
            <input value={town} onChange={(e) => setTown(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="client-section" style={{ marginTop: 24 }}>
        <h3>Bank details (invoices)</h3>
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
            <input value={bankSortCode} onChange={(e) => setBankSortCode(e.target.value)} />
          </label>
          <label>
            Account number
            <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="client-section" style={{ marginTop: 24 }}>
        <h3>Missed-call rescue</h3>
        <p className="muted-text">
          Assign a Twilio number, then dial these codes once on your phone so unanswered calls come to us instead of
          voicemail.
        </p>
        <label>
          Twilio number (E.164)
          <input value={twilioNumber} onChange={(e) => setTwilioNumber(e.target.value)} placeholder="+44…" />
        </label>
        {me.data?.divertCodes && (
          <ul className="muted-text">
            <li>No answer: <code>{me.data.divertCodes.noAnswer}</code></li>
            <li>Busy: <code>{me.data.divertCodes.busy}</code></li>
            <li>Off / no signal: <code>{me.data.divertCodes.unreachable}</code></li>
          </ul>
        )}
      </section>

      <div className="drawer-actions" style={{ marginTop: 16 }}>
        <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
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
      {save.isError && <p className="error">{(save.error as Error).message}</p>}
      {save.isSuccess && <p className="muted-text">Saved.</p>}
    </div>
  );
}
