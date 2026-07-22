/**
 * Smoke-test Resend using the same env vars as the API.
 * Usage (from server/): node --env-file=.env scripts/test-resend.mjs [to@email]
 */
const apiKey = process.env.RESEND_API_KEY?.trim();
const from = process.env.EMAIL_FROM?.trim() || "TradiesMate <onboarding@resend.dev>";
const to = process.argv[2]?.trim() || process.env.EARLY_ACCESS_NOTIFY_EMAIL?.trim();

if (!apiKey) {
  console.error("Missing RESEND_API_KEY in env");
  process.exit(1);
}
if (!to) {
  console.error("Pass a recipient: node scripts/test-resend.mjs you@example.com");
  process.exit(1);
}

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from,
    to: [to],
    subject: "TradiesMate Resend test",
    text: "If you got this, Resend is wired for TradiesMate.",
    html: "<p>If you got this, <strong>Resend</strong> is wired for TradiesMate.</p>",
  }),
});

const body = await res.text();
if (!res.ok) {
  console.error("Resend failed", res.status, body);
  process.exit(1);
}
console.log("Sent OK →", to, "from", from);
console.log(body);
