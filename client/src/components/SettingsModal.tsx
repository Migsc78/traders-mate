import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type SettingsField, type SettingsView } from "../api/client";

interface Props {
  onClose: () => void;
}

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

export default function SettingsModal({ onClose }: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });

  const [googlePlacesApiKey, setGooglePlacesApiKey] = useState("");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioSmsFrom, setTwilioSmsFrom] = useState("");
  const [twilioWhatsappFrom, setTwilioWhatsappFrom] = useState("");
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
      setClaudeApiKey("");
      setOpenaiApiKey("");
      setMissedCallSayVoice(next.missedCallSayVoice || "Polly.Amy");
      setMissedCallSayText(next.missedCallSayText || "");
      setMissedCallSmsText(next.missedCallSmsText || "");
      setSaved(true);
    },
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <button className="close" onClick={onClose} aria-label="Close settings">
          ×
        </button>
        <h2>Settings</h2>
        <p className="hint">
          API keys and missed-call scripts. On Railway, also set the matching env vars so they survive redeploys.
        </p>

        {isLoading ? (
          <p className="muted-text">Loading…</p>
        ) : (
          <form
            className="form settings-form"
            onSubmit={(e) => {
              e.preventDefault();
              setSaved(false);
              save.mutate();
            }}
          >
            <label>
              Google Places API key
              <input
                type="password"
                autoComplete="off"
                placeholder={fieldHint(data?.googlePlacesApiKey)}
                value={googlePlacesApiKey}
                onChange={(e) => setGooglePlacesApiKey(e.target.value)}
              />
              <span className="field-hint">Required for lead searches. Leave blank to keep the current key.</span>
            </label>

            <h3 className="settings-section-title">Twilio</h3>
            <p className="field-hint settings-section-hint">
              For SMS and WhatsApp. Get credentials from{" "}
              <a href="https://console.twilio.com" target="_blank" rel="noreferrer">
                console.twilio.com
              </a>
              .
            </p>

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

            <h3 className="settings-section-title">Missed-call voice &amp; SMS</h3>
            <p className="field-hint settings-section-hint">
              Spoken when a call is diverted to Twilio, then the first SMS to the caller. Use{" "}
              <code>{"{{businessName}}"}</code> for the tradie&apos;s name. Test by calling the Twilio number
              directly. Prefer Polly/Google voices — Alice is the robotic one.
            </p>

            <label>
              TTS voice
              <select value={missedCallSayVoice} onChange={(e) => setMissedCallSayVoice(e.target.value)}>
                {VOICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Spoken message (TTS)
              <textarea
                rows={3}
                value={missedCallSayText}
                onChange={(e) => setMissedCallSayText(e.target.value)}
                placeholder="Sorry we missed your call…"
              />
            </label>

            <label>
              First SMS to caller
              <textarea
                rows={3}
                value={missedCallSmsText}
                onChange={(e) => setMissedCallSmsText(e.target.value)}
                placeholder="Hi, this is {{businessName}}'s assistant…"
              />
            </label>

            <h3 className="settings-section-title">Quote AI</h3>
            <p className="field-hint settings-section-hint">
              Claude extracts line items; OpenAI Whisper is optional for audio.
            </p>

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
              OpenAI API key (voice transcription)
              <input
                type="password"
                autoComplete="off"
                placeholder={fieldHint(data?.openaiApiKey)}
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
              />
            </label>

            {save.error && <p className="error">{(save.error as Error).message}</p>}
            {saved && !save.error && <p className="success">Settings saved.</p>}

            <div className="modal-actions">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
