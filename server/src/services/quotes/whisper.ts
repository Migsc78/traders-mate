import { getOpenaiApiKey } from "../../settings.js";

/** Transcribe audio with OpenAI Whisper. Optional — typed notes work without this. */
export async function transcribeWithWhisper(
  audio: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const apiKey = getOpenaiApiKey();
  if (!apiKey) throw new Error("OpenAI API key not configured — add it in Settings for voice transcription, or paste typed notes instead");

  const form = new FormData();
  const blob = new Blob([new Uint8Array(audio)], { type: contentType || "audio/webm" });
  form.append("file", blob, filename || "job.webm");
  form.append("model", "whisper-1");
  form.append("language", "en");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(json.error?.message || `Whisper error ${res.status}`);
  const text = (json.text || "").trim();
  if (!text) throw new Error("Empty transcript");
  return text;
}
