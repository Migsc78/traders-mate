/**
 * End-to-end tradie journey: missed call → quote → job → invoice → paid.
 *
 * Prerequisites: Postgres migrated + seeded, API on :4000, TWILIO_AUTH_TOKEN unset (dev).
 * Run from server/:  node scripts/e2e-tradie-journey.mjs
 */
const BASE = process.env.API_BASE || "http://localhost:4000";
const ROUTE_KEY = "seed_tm_demo_plumbing";
const TWILIO_TO = "+447000001001";
const CUSTOMER_FROM = "+447700900321";

let failed = 0;
const steps = [];

function record(ok, name, detail) {
  steps.push({ ok, name, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function req(method, path, { token, body, form, headers } = {}) {
  const h = { ...(headers || {}) };
  let payload;
  if (form) {
    h["Content-Type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    h["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html / twiml */
  }
  return { ok: res.ok, status: res.status, json, text };
}

function assert(cond, name, detail) {
  record(!!cond, name, detail);
  if (!cond) throw new Error(`STOP: ${name} — ${detail || ""}`);
}

async function main() {
  console.log(`\n=== Tradie journey E2E @ ${BASE} ===\n`);

  // 0. Health + login
  const health = await req("GET", "/api/health");
  assert(health.ok && health.json?.ok, "0a health", JSON.stringify(health.json));

  const login = await req("POST", "/api/t/auth/seed-login", { body: { routeKey: ROUTE_KEY } });
  assert(login.ok && login.json?.sessionToken, "0b seed-login", login.text?.slice(0, 200));
  const token = login.json.sessionToken;
  record(true, "0c session", login.json.businessName);

  const me = await req("GET", "/api/t/me", { token });
  assert(me.ok && me.json?.status === "ACTIVE", "0d account ACTIVE", me.json?.status);

  // 1. Missed call → SMS qualify → inbox enquiry
  const callSid = `CA_e2e_${Date.now()}`;
  const voice = await req("POST", "/api/twilio/voice/missed", {
    form: {
      From: CUSTOMER_FROM,
      To: TWILIO_TO,
      CallSid: callSid,
      CallStatus: "no-answer",
    },
  });
  assert(
    voice.status === 200 && /Response|Say|Message/i.test(voice.text),
    "1a voice missed webhook",
    `status=${voice.status} body=${voice.text.slice(0, 120)}`
  );

  const smsBody =
    "Hi this is Sam at 14 Oak Road GU21 6AA — boiler leaking badly through the ceiling, need someone today";
  const sms = await req("POST", "/api/twilio/sms/inbound", {
    form: {
      From: CUSTOMER_FROM,
      To: TWILIO_TO,
      Body: smsBody,
      MessageSid: `SM_e2e_${Date.now()}`,
    },
  });
  assert(sms.status === 200, "1b SMS inbound qualify", `status=${sms.status} ${sms.text.slice(0, 100)}`);

  // Poll inbox for the new enquiry (qualifier may create synchronously)
  let enquiry = null;
  for (let i = 0; i < 8; i++) {
    const inbox = await req("GET", "/api/t/inbox", { token });
    assert(inbox.ok, "1c GET inbox", `status=${inbox.status}`);
    const items = inbox.json?.items || [];
    enquiry = items.find(
      (it) =>
        String(it.phone || "").includes("900321") ||
        String(it.message || "").toLowerCase().includes("boiler") ||
        String(it.name || "").toLowerCase().includes("sam")
    );
    if (enquiry) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  assert(!!enquiry?.id, "1d inbox enquiry created", enquiry ? enquiry.id : "not found");
  record(true, "1e enquiry snapshot", `${enquiry.name} / ${enquiry.postcode || "no pc"} / ${enquiry.id}`);

  // 2. Promote to job
  const promote = await req("POST", `/api/t/jobs/${enquiry.id}/promote`, { token, body: {} });
  assert(
    promote.ok && (promote.json?.pipeline === "JOB" || promote.json?.id),
    "2a promote to job",
    promote.ok ? `job=${promote.json.id} pipeline=${promote.json.pipeline}` : promote.text.slice(0, 200)
  );
  const jobId = promote.json.id || enquiry.id;

  const job = await req("GET", `/api/t/jobs/${jobId}`, { token });
  assert(job.ok, "2b GET job", `status=${job.status}`);

  // 3. Create quote (manual lines — no Claude required), attach customer, send
  const created = await req("POST", "/api/t/quotes", {
    token,
    body: {
      lines: [
        { label: "Emergency call-out", qty: 1, unit: "JOB", unitPricePence: 8500, vatRate: 20 },
        { label: "PRV + fittings", qty: 1, unit: "EACH", unitPricePence: 4200, vatRate: 20 },
        { label: "Labour", qty: 2, unit: "HOUR", unitPricePence: 5500, vatRate: 20 },
      ],
    },
  });
  const quoteId = created.json?.id;
  assert(
    (created.ok || created.status === 201) && quoteId,
    "3a create draft quote",
    created.ok || created.status === 201 ? quoteId : created.text.slice(0, 300)
  );

  const attach = await req("PATCH", `/api/t/quotes/${quoteId}/customer`, {
    token,
    body: { enquiryId: jobId },
  });
  assert(attach.ok, "3a2 attach enquiry to quote", attach.ok ? attach.json?.enquiryId || "ok" : attach.text.slice(0, 200));

  const lines = await req("PUT", `/api/t/quotes/${quoteId}/lines`, {
    token,
    body: {
      vatInclusive: false,
      customerNote: "Includes call-out, PRV and labour.",
      lines: [
        { label: "Emergency call-out", qty: 1, unit: "JOB", unitPricePence: 8500, vatRate: 20 },
        { label: "PRV + fittings", qty: 1, unit: "EACH", unitPricePence: 4200, vatRate: 20 },
        { label: "Labour", qty: 2, unit: "HOUR", unitPricePence: 5500, vatRate: 20 },
      ],
    },
  });
  assert(
    lines.ok && (lines.json?.totalPence || 0) > 0,
    "3b price quote lines",
    `totalPence=${lines.json?.totalPence}`
  );

  const approved = await req("POST", `/api/t/quotes/${quoteId}/approve`, {
    token,
    body: { channels: ["SMS"], depositPercent: 0, message: "Your quote from Dave's Plumbing" },
  });
  assert(
    approved.ok && approved.json?.status === "SENT" && approved.json?.publicUrl,
    "3c approve/send quote",
    approved.ok
      ? `status=${approved.json.status} url=${approved.json.publicUrl}`
      : approved.text.slice(0, 300)
  );
  const publicUrl = approved.json.publicUrl;
  const qToken = publicUrl.includes("/q/") ? publicUrl.split("/q/")[1].split(/[?#]/)[0] : null;
  assert(!!qToken, "3d public quote token", qToken);

  const pubQ = await req("GET", `/q/${qToken}`, { headers: { Accept: "application/json" } });
  // public may return HTML; accept 200 either way
  assert(pubQ.status === 200, "3e public quote page", `status=${pubQ.status}`);

  // 4. Customer accepts
  const accept = await req("POST", `/q/${qToken}/accept`, {
    headers: { Accept: "application/json" },
    body: {},
  });
  assert(
    accept.ok && (accept.json?.status === "ACCEPTED" || /accepted/i.test(accept.text)),
    "4a customer accept quote",
    accept.json ? JSON.stringify(accept.json) : accept.text.slice(0, 120)
  );

  const quoteAfter = await req("GET", `/api/t/quotes/${quoteId}`, { token });
  assert(
    quoteAfter.ok && quoteAfter.json?.status === "ACCEPTED",
    "4b quote status ACCEPTED",
    quoteAfter.json?.status
  );

  // 5. Invoice from quote → send → mark paid
  const invCreate = await req("POST", `/api/t/invoices/from-quote/${quoteId}`, { token, body: {} });
  const invoiceId = invCreate.json?.id || invCreate.json?.invoice?.id;
  assert(
    (invCreate.ok || invCreate.status === 201) && invoiceId,
    "5a create invoice from quote",
    invCreate.ok || invCreate.status === 201 ? invoiceId : invCreate.text.slice(0, 300)
  );

  const invSend = await req("POST", `/api/t/invoices/${invoiceId}/send`, { token, body: {} });
  assert(
    invSend.ok && (invSend.json?.status === "SENT" || invSend.json?.invoice?.status === "SENT"),
    "5b send invoice",
    invSend.ok
      ? `publicUrl=${invSend.json?.publicUrl || invSend.json?.invoice?.publicUrl}`
      : invSend.text.slice(0, 300)
  );
  const invPublic =
    invSend.json?.publicUrl ||
    (invSend.json?.invoice?.publicToken ? `${BASE}/i/${invSend.json.invoice.publicToken}` : null) ||
    (invSend.json?.publicToken ? `${BASE}/i/${invSend.json.publicToken}` : null);

  let iToken = null;
  if (invPublic?.includes("/i/")) iToken = invPublic.split("/i/")[1].split(/[?#]/)[0];
  if (!iToken && invSend.json?.invoice?.publicToken) iToken = invSend.json.invoice.publicToken;
  if (!iToken && invSend.json?.publicToken) iToken = invSend.json.publicToken;

  // Refresh invoice list if needed
  if (!iToken) {
    const list = await req("GET", "/api/t/invoices", { token });
    const row = (Array.isArray(list.json) ? list.json : []).find((i) => i.id === invoiceId);
    iToken = row?.publicToken || null;
    record(!!iToken, "5b2 resolve invoice token", iToken || "missing");
  }

  if (iToken) {
    const pubI = await req("GET", `/i/${iToken}`);
    assert(pubI.status === 200, "5c public invoice page", `status=${pubI.status}`);
  } else {
    record(false, "5c public invoice page", "no token");
  }

  const paid = await req("POST", `/api/t/invoices/${invoiceId}/mark-paid`, { token, body: {} });
  assert(
    paid.ok && (paid.json?.status === "PAID" || paid.json?.invoice?.status === "PAID"),
    "5d mark invoice paid",
    paid.json?.status || paid.json?.invoice?.status || paid.text.slice(0, 200)
  );

  console.log("\n=== SUMMARY ===");
  console.log(`Passed: ${steps.filter((s) => s.ok).length}/${steps.length}`);
  if (failed) {
    console.log(`FAILED steps: ${failed}`);
    process.exit(1);
  }
  console.log("Journey completed flawlessly.");
}

main().catch((e) => {
  console.error("\nJourney aborted:", e.message || e);
  console.log("\n=== STEPS SO FAR ===");
  for (const s of steps) console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.name}${s.detail ? ` — ${s.detail}` : ""}`);
  process.exit(1);
});
