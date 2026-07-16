import type { JobProgress, SearchSummary } from "../types";
import { apiUrl } from "./base";

function parseSseChunk(chunk: string): { event: string; data: string } | null {
  const lines = chunk.split("\n");
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data = line.slice(5).trim();
  }
  return data ? { event, data } : null;
}

export async function postSse<TComplete>(
  url: string,
  body: unknown,
  onProgress?: (progress: JobProgress) => void
): Promise<TComplete> {
  const opToken = String(import.meta.env.VITE_OPERATOR_API_TOKEN || localStorage.getItem("tm_operator_token") || "").trim();
  const res = await fetch(apiUrl(url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opToken ? { Authorization: `Bearer ${opToken}`, "x-operator-token": opToken } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      message = errBody?.error?.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete: TComplete | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const parsed = parseSseChunk(part);
      if (!parsed) continue;

      if (parsed.event === "progress") {
        onProgress?.(JSON.parse(parsed.data) as JobProgress);
      } else if (parsed.event === "complete") {
        complete = JSON.parse(parsed.data) as TComplete;
      } else if (parsed.event === "error") {
        const err = JSON.parse(parsed.data) as { message?: string };
        throw new Error(err.message || "Operation failed");
      }
    }
  }

  if (complete === undefined) throw new Error("Stream ended without a result");
  return complete;
}

export function searchWithProgress(
  input: Record<string, unknown>,
  onProgress?: (progress: JobProgress) => void
): Promise<SearchSummary> {
  return postSse<SearchSummary>("/api/search/stream", input, onProgress);
}
