import { prisma } from "../../db.js";
import type { MessageChannel, MessageDirection } from "@prisma/client";

export async function logMessage(opts: {
  clientId: string;
  enquiryId?: string | null;
  direction: MessageDirection;
  channel?: MessageChannel;
  toAddr: string;
  fromAddr?: string | null;
  body: string;
  twilioSid?: string | null;
  status?: string;
}) {
  try {
    return await prisma.message.create({
      data: {
        clientId: opts.clientId,
        enquiryId: opts.enquiryId ?? null,
        direction: opts.direction,
        channel: opts.channel ?? "SMS",
        toAddr: opts.toAddr,
        fromAddr: opts.fromAddr ?? null,
        body: opts.body,
        twilioSid: opts.twilioSid ?? null,
        status: opts.status ?? "sent",
      },
    });
  } catch (e) {
    console.warn("[message-log]", e instanceof Error ? e.message : e);
    return null;
  }
}
