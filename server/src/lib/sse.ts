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
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
}

export function sendSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function endSse(res: Response) {
  res.end();
}
