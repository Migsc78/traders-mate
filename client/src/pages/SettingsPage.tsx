import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SettingsField, type SettingsView } from "../api/client";

function fieldHint(field: SettingsField | undefined): string {
  if (!field?.configured) return "Not configured";
  return field.hint ? `Saved (${field.hint})` : "Saved";
}

const VOICE_OPTIONS = [
  { value: "Polly.Amy", label: "Polly Amy (UK, natural — recommended)" },
  { value: "Polly.Emma", label: "Polly Emma (UK)" },
  { value: "Polly.Brian", label: "Polly Brian (UK, male)" },
  { value: "Google.en-GB-Neural2-A", label: "Google Neural2-A (UK)" },
  { value: "Google.en-GB-Neural2-B", label: "Google Neural2-B (UK, male)" },
  { value: "alice", label: "Alice (basic — robotic)" },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });

  const [googlePlacesApiKey, setGooglePlacesApiKey] = useState("");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioSmsFrom, setTwilioSmsFrom] = useState("");
  const [twilioWhatsappFrom, setTwilioWhatsappFrom] = useState("");
  const [twilioUkBundleSid, setTwilioUkBundleSid] = useState("");
  const [twilioUkAddressSid, setTwilioUkAddressSid] = useState("");
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [missedCallSayVoice, setMissedCallSayVoice] = useState("Polly.Amy");
  const [missedCallSayText, setMissedCallSayText] = useState("");
  const [missedCallSmsText, setMissedCallSmsText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMissedCallSayVoice(data.missedCallSayVoice || "Polly.Amy");
    setMissedCallSayText(data.missedCallSayText || "");
    setMissedCallSmsText(data.missedCallSmsText || "");
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.updateSettings({
        ...(googlePlacesApiKey.trim() ? { googlePlacesApiKey: googlePlacesApiKey.trim() } : {}),
        ...(twilioAccountSid.trim() ? { twilioAccountSid: twilioAccountSid.trim() } : {}),
        ...(twilioAuthToken.trim() ? { twilioAuthToken: twilioAuthToken.trim() } : {}),
        ...(twilioSmsFrom.trim() ? { twilioSmsFrom: twilioSmsFrom.trim() } : {}),
        ...(twilioWhatsappFrom.trim() ? { twilioWhatsappFrom: twilioWhatsappFrom.trim() } : {}),
        ...(twilioUkBundleSid.trim() ? { twilioUkBundleSid: twilioUkBundleSid.trim() } : {}),
        ...(twilioUkAddressSid.trim() ? { twilioUkAddressSid: twilioUkAddressSid.trim() } : {}),
        ...(claudeApiKey.trim() ? { claudeApiKey: claudeApiKey.trim() } : {}),
        ...(openaiApiKey.trim() ? { openaiApiKey: openaiApiKey.trim() } : {}),
        missedCallSayVoice: missedCallSayVoice.trim(),
        missedCallSayText: missedCallSayText.trim(),
        missedCallSmsText: missedCallSmsText.trim(),
      }),
    onSuccess: (next: SettingsView) => {
      qc.setQueryData(["settings"], next);
      qc.invalidateQueries({ queryKey: ["health"] });
      setGooglePlacesApiKey("");
      setTwilioAccountSid("");
      setTwilioAuthToken("");
      setTwilioSmsFrom("");
      setTwilioWhatsappFrom("");
      setTwilioUkBundleSid("");
      setTwilioUkAddressSid("");
      setClaudeApiKey("");
      setOpenaiApiKey("");
      setMissedCallSayVoice(next.missedCallSayVoice || "Polly.Amy");
      setMissedCallSayText(next.missedCallSayText || "");
      setMissedCallSmsText(next.missedCallSmsText || "");
      setSaved(true);
    },
  });

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">
            API keys and scripts by function. On Railway, also set matching env vars so they survive redeploys.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={isLoading || save.isPending}
          onClick={() => {
            setSaved(false);
            save.mutate();
          }}
        >
          {save.isPending ? "Saving…" : "Save settings"}
        </button>
      </header>

      {save.error && <p className="error">{(save.error as Error).message}</p>}
      {saved && !save.error && <p className="success">Settings saved.</p>}

      {isLoading ? (
        <p className="muted-text">Loading…</p>
      ) : (
        <form
          className="settings-layout"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            save.mutate();
          }}
        >
          <section className="card settings-section">
            <div className="settings-section-head">
              <h2>Lead search</h2>
              <p>Google Places powers Search and lead enrichment.</p>
            </div>
            <div className="form-grid">
              <label className="span-2">
                Google Places API key
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={fieldHint(data?.googlePlacesApiKey)}
                  value={googlePlacesApiKey}
                  onChange={(e) => setGooglePlacesApiKey(e.target.value)}
                />
                <span className="field-hint">Leave blank to keep the current key.</span>
              </label>
            </div>
          </section>

          <section className="card settings-section">
            <div className="settings-section-head">
              <h2>Messaging (Twilio)</h2>
              <p>
                SMS and WhatsApp for job alerts and caller texts. Credentials from{" "}
                <a href="https://console.twilio.com" target="_blank" rel="noreferrer">
                  console.twilio.com
                </a>
                .
              </p>
            </div>
            <div className="form-grid">
              <label>
                Twilio Account SID
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={fieldHint(data?.twilioAccountSid)}
                  value={twilioAccountSid}
                  onChange={(e) => setTwilioAccountSid(e.target.value)}
                />
              </label>
              <label>
                Twilio Auth Token
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={fieldHint(data?.twilioAuthToken)}
                  value={twilioAuthToken}
                  onChange={(e) => setTwilioAuthToken(e.target.value)}
                />
              </label>
              <label>
                SMS sender number
                <input
                  type="text"
                  autoComplete="off"
                  placeholder={fieldHint(data?.twilioSmsFrom) || "e.g. +447700900000"}
                  value={twilioSmsFrom}
                  onChange={(e) => setTwilioSmsFrom(e.target.value)}
                />
              </label>
              <label>
                WhatsApp sender number
                <input
                  type="text"
                  autoComplete="off"
                  placeholder={fieldHint(data?.twilioWhatsappFrom) || "e.g. +14155238886"}
                  value={twilioWhatsappFrom}
                  onChange={(e) => setTwilioWhatsappFrom(e.target.value)}
                />
              </label>
              <label>
                UK Mobile Bundle SID
                <input
                  type="text"
                  autoComplete="off"
                  placeholder={fieldHint(data?.twilioUkBundleSid) || "BU… (approved GB Mobile)"}
                  value={twilioUkBundleSid}
                  onChange={(e) => setTwilioUkBundleSid(e.target.value)}
                />
              </label>
              <label>
                UK Address SID
                <input
                  type="text"
                  autoComplete="off"
                  placeholder={fieldHint(data?.twilioUkAddressSid) || "AD… (GB address)"}
                  value={twilioUkAddressSid}
                  onChange={(e) => setTwilioUkAddressSid(e.target.value)}
                />
              </label>
            </div>
            <p className="muted-text" style={{ marginTop: 8 }}>
              Bundle + Address are required to auto-buy a dedicated inbound number for each paying tradie.
              Saved in the database so Railway redeploys keep them.
            </p>
          </section>

          <section className="card settings-section">
            <div className="settings-section-head">
              <h2>Missed-call rescue</h2>
              <p>
                Default TTS and first SMS when a call is diverted. Use <code>{"{{businessName}}"}</code> for the
                tradie&apos;s name. Tradies with a custom greeting skip TTS.
              </p>
            </div>
            <div className="form-grid">
              <label className="span-2">
                TTS voice
                <select value={missedCallSayVoice} onChange={(e) => setMissedCallSayVoice(e.target.value)}>
                  {VOICE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-2">
                Spoken message (TTS)
                <textarea
                  rows={3}
                  value={missedCallSayText}
                  onChange={(e) => setMissedCallSayText(e.target.value)}
                  placeholder="Sorry we missed your call…"
                />
              </label>
              <label className="span-2">
                First SMS to caller
                <textarea
                  rows={3}
                  value={missedCallSmsText}
                  onChange={(e) => setMissedCallSmsText(e.target.value)}
                  placeholder="Hi, this is {{businessName}}'s assistant…"
                />
              </label>
            </div>
          </section>

          <section className="card settings-section">
            <div className="settings-section-head">
              <h2>Quote AI</h2>
              <p>Claude extracts line items from notes; OpenAI Whisper is optional for voice.</p>
            </div>
            <div className="form-grid">
              <label>
                Claude API key
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={fieldHint(data?.claudeApiKey)}
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                />
              </label>
              <label>
                OpenAI API key (Whisper)
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={fieldHint(data?.openaiApiKey)}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                />
              </label>
            </div>
          </section>

          <div className="settings-save-bar">
            <button type="submit" className="primary" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
