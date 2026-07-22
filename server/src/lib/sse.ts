import type { Response } from "express";

export interface JobProgress {
  phase: "fetch" | "process";
  current: number;
  total: number;
  message: string;
  percent: number;
}

export function initSse(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

function flush(res: Response) {
  const r = res as Response & { flush?: () => void };
  if (typeof r.flush === "function") r.flush();
}

export function sendSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  flush(res);
}

/** Keep proxies from closing idle SSE while Google Places / enrichment runs. */
export function startSseHeartbeat(res: Response, intervalMs = 12000): () => void {
  const id = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
      flush(res);
    } catch {
      clearInterval(id);
    }
  }, intervalMs);
  return () => clearInterval(id);
}

export function endSse(res: Response) {
  res.end();
}
