import { env } from "../../env.js";
import { appPublicUrl } from "../quotes/magicAuth.js";
import { sendMessage } from "../messaging/sender.js";

/** Best-effort transactional email via Resend (optional). */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim() || "TradiesMate <onboarding@resend.dev>";
  if (!apiKey) {
    console.log(`[email:stub] to=${opts.to} subject=${opts.subject}: ${opts.text.slice(0, 120)}`);
    return { ok: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html || `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(opts.text)}</pre>`,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[email] resend failed", res.status, body.slice(0, 200));
      return { ok: false, error: body || `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "email failed" };
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyEarlyAccessRequest(opts: {
  email: string;
  phone: string;
  occupation: string;
  requestId: string;
}) {
  const adminEmail = env.EARLY_ACCESS_NOTIFY_EMAIL?.trim();
  const adminPhone = env.EARLY_ACCESS_NOTIFY_PHONE?.trim();
  const subject = `Early access request: ${opts.occupation}`;
  const text = [
    "New TradiesMate early access request",
    "",
    `Occupation: ${opts.occupation}`,
    `Email: ${opts.email}`,
    `Mobile: ${opts.phone}`,
    `Id: ${opts.requestId}`,
    "",
    `Review in admin: ${appPublicUrl()}/admin/early-access`,
  ].join("\n");

  if (adminEmail) {
    await sendEmail({ to: adminEmail, subject, text });
  } else {
    console.log(`[early-access] notify (no EARLY_ACCESS_NOTIFY_EMAIL): ${text}`);
  }

  if (adminPhone) {
    await sendMessage({
      to: adminPhone,
      channel: "SMS",
      body: `TradiesMate early access: ${opts.occupation} · ${opts.phone} · ${opts.email}`,
    });
  }
}
