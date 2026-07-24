/** Encode decoded PCM as a 16-bit mono/stereo WAV Blob for Twilio <Play>. */

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const samples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples * blockAlign;
  const headerSize = 44;
  const ab = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(ab);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([ab], { type: "audio/wav" });
}

/** True when we can upload without decodeAudioData (Twilio-friendly types only). */
export function isDirectUploadAudio(type: string): boolean {
  const t = type.toLowerCase();
  // Twilio <Play> accepts wav/mp3 — NOT mp4/m4a/aac (error 12300 → scramble/noise).
  return /(audio\/)?(wav|x-wav|mpeg|mp3)\b/.test(t) && !/mp4|m4a|aac|webm/.test(t);
}

export function greetingUploadContentType(blob: Blob): string {
  const t = (blob.type || "").split(";")[0]!.trim().toLowerCase();
  if (t.includes("wav")) return "audio/wav";
  if (t.includes("mpeg") || t.includes("mp3")) return "audio/mpeg";
  return "audio/wav";
}

/**
 * Convert browser recordings to WAV for Twilio.
 * WebM often fails decodeAudioData on mobile ("Load failed") — callers should prefer
 * uploading mp3/wav when conversion fails.
 */
export async function blobToWav(blob: Blob): Promise<Blob> {
  if (blob.type.toLowerCase().includes("wav")) return blob;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("This browser cannot convert audio — upload a WAV or MP3 instead");
  const ctx = new Ctx();
  try {
    const arr = await blob.arrayBuffer();
    if (!arr.byteLength) throw new Error("Empty recording — hold for a few seconds, then Stop & save");
    const decoded = await ctx.decodeAudioData(arr.slice(0));
    return audioBufferToWav(decoded);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/load failed|unable to decode|encodingerror|notsupported/i.test(msg)) {
      throw new Error(
        "This phone couldn't convert the recording. Use Upload WAV/MP3, or try recording again and speak for ~10 seconds."
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/** Prepare a recorded/uploaded blob for the greeting API. Always ends as wav/mp3 for Twilio. */
export async function prepareGreetingUpload(blob: Blob): Promise<{ contentType: string; blob: Blob }> {
  if (blob.size < 800) {
    throw new Error("Recording was empty — hold for a few seconds, then Stop & save");
  }
  if (blob.size > 2 * 1024 * 1024) {
    throw new Error("Greeting too long — keep it under about 20 seconds");
  }
  if (isDirectUploadAudio(blob.type)) {
    return { contentType: greetingUploadContentType(blob), blob };
  }
  // MediaRecorder mp4/webm/aac → WAV (Twilio cannot play audio/mp4)
  const wav = await blobToWav(blob);
  return { contentType: "audio/wav", blob: wav };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read audio"));
    reader.readAsDataURL(blob);
  });
}

/** Prefer mp4 on iOS/Safari (WebM decode often fails there). */
export function preferredRecorderMime(): string {
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
  const order = isApple
    ? ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const mime of order) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}
