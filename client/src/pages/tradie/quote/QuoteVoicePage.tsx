import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendOrQueue } from "../../../api/tradie";
import { startQuote } from "../../../lib/newQuote";
import { QueryError } from "../ui";
import { useOffline } from "../../../lib/connectivity";

/**
 * Step 5 — speak the job, get a draft.
 *
 * Recording is entirely local; only the transcribe-and-price step needs the
 * server. Both writes queue, so a minute of talking in a plant room is never
 * thrown away — the draft exists immediately and fills in on reconnect.
 */
export default function QuoteVoicePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const offline = useOffline();
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAt = useRef<number>(0);

  const build = useMutation({
    mutationFn: async (p: { contentType: string; dataBase64: string; durationSec: number }) => {
      const id = await startQuote(qc, {
        label: "Quote from voice",
        lines: [{ label: "Voice note — pricing when back in range", qty: 1, unit: "JOB", unitPricePence: 0, vatRate: 20 }],
      });
      await sendOrQueue({
        label: "Transcribe voice note",
        path: `/quotes/${id}/from-voice`,
        method: "POST",
        body: p,
        invalidates: ["tradie-quote", "tradie-quotes"],
      });
      return id;
    },
  });

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    chunksRef.current = [];
    startedAt.current = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      const durationSec = Math.round((Date.now() - startedAt.current) / 1000);
      const reader = new FileReader();
      reader.onload = () =>
        build.mutate({
          contentType: blob.type || "audio/webm",
          dataBase64: String(reader.result || ""),
          durationSec,
        });
      reader.readAsDataURL(blob);
    };
    mediaRef.current = rec;
    rec.start();
    setRecording(true);
  };

  const stop = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="t-voice-page">
      {!build.isSuccess && (
        <>
          <button
            type="button"
            className={`t-mic${recording ? " is-live" : ""}`}
            disabled={build.isPending}
            onClick={() => (recording ? stop() : void start())}
            aria-label={recording ? "Stop recording" : "Start recording"}
          >
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
            </svg>
          </button>

          <p className="t-voice-state">
            {build.isPending
              ? offline
                ? "Saving…"
                : "Transcribing & pricing…"
              : recording
                ? "Listening…"
                : "Tap to start"}
          </p>
          <p className="muted-text t-voice-hint">
            {recording ? "Tap again when you're done." : "Describe the job and we'll build your quote."}
          </p>
        </>
      )}

      <QueryError error={build.error} />

      {build.isSuccess && (
        <div className="t-draft-done">
          <p className="t-draft-done-title">✓ {offline ? "Recording saved" : "Draft generated"}</p>
          <p className="muted-text">
            {offline
              ? "We'll transcribe and price it the moment you're back in range."
              : "Review your quote draft based on your voice input."}
          </p>
          <button
            type="button"
            className="t-btn t-btn--block"
            onClick={() => navigate(`/t/quotes/${build.data}/edit`, { replace: true })}
          >
            Review draft
          </button>
        </div>
      )}
    </div>
  );
}
