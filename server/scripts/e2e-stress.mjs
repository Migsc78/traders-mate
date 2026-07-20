/**
 * One-shot E2E API stress harness for TradiesMate seed account.
 * Run: node scripts/e2e-stress.mjs  (from server/)
 */
const BASE = process.env.API_BASE || "http://localhost:4000";

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { ok: res.ok, status: res.status, json, text, headers: res.headers };
}

function log(ok, name, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const findings = [];
  const login = await req("POST", "/api/t/auth/seed-login", { body: { routeKey: "seed_tm_demo_plumbing" } });
  if (!login.ok) {
    console.error("Cannot seed-login", login.status, login.text);
    process.exit(1);
  }
  const token = login.json.sessionToken;
  log(true, "seed-login", login.json.businessName);

  const me = await req("GET", "/api/t/me", { token });
  log(me.ok, "GET /me", `connect=${me.json?.stripeConnectOnboarded} deposit=${me.json?.defaultDepositPercent}`);

  const health = await req("GET", "/api/health");
  log(health.ok, "health", `appPublicUrl=${health.json?.appPublicUrl} origins=${JSON.stringify(health.json?.clientOrigins)}`);
  if (!health.json?.appPublicUrl) findings.push({ sev: "high", msg: "APP_PUBLIC_URL unset — public quote/invoice SMS links fall back to CLIENT_ORIGIN (often :5173) which may not match the running Vite port" });
  if (health.json?.clientOrigins && !health.json.clientOrigins.includes("http://localhost:5174")) {
    findings.push({ sev: "med", msg: "CLIENT_ORIGIN list may not include Vite port 5174 (CORS for /api admin; tradie /api/t uses origin:true so OK)" });
  }

  const connect = await req("GET", "/api/t/connect/status", { token });
  log(connect.ok, "connect/status", JSON.stringify(connect.json));
  if (!connect.json?.configured) findings.push({ sev: "high", msg: "Stripe not configured locally — Pay Now / deposits / Connect onboard cannot be exercised end-to-end" });

  const jobs = await req("GET", "/api/t/jobs", { token });
  const jobList = Array.isArray(jobs.json) ? jobs.json : [];
  log(jobs.ok && jobList.length > 0, "list jobs", `count=${jobList.length}`);
  const jobId = jobList[0]?.id;

  // SMS
  const sms = await req("POST", `/api/t/jobs/${jobId}/messages`, { token, body: { text: "E2E SMS composer stress " + Date.now() } });
  log(sms.ok, "POST job SMS", JSON.stringify(sms.json));
  const msgs = await req("GET", `/api/t/jobs/${jobId}/messages`, { token });
  log(msgs.ok && (msgs.json?.length || 0) > 0, "GET job messages", `count=${msgs.json?.length}`);

  // Diary
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCHours(14, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 3600000);
  const apptBody = {
    enquiryId: jobId,
    title: "E2E diary book",
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    customerName: jobList[0].name,
    customerPhone: jobList[0].phone,
    address: jobList[0].postcode,
  };
  const appt = await req("POST", "/api/t/appointments", { token, body: apptBody });
  log(appt.ok, "create appointment", appt.ok ? appt.json.appointment?.id : appt.text);
  const clash = await req("POST", "/api/t/appointments", { token, body: apptBody });
  log(clash.status === 409, "clash warning", clash.json?.error?.code);
  if (appt.ok) {
    const omy = await req("POST", `/api/t/appointments/${appt.json.appointment.id}/on-my-way`, { token, body: {} });
    log(omy.ok, "on-my-way SMS", omy.json?.appointment?.status);
  }

  // Certificates
  const cert = await req("POST", "/api/t/certificates", {
    token,
    body: {
      kind: "MINOR_WORKS",
      enquiryId: jobId,
      siteAddress: jobList[0].postcode,
      customerName: jobList[0].name,
      customerPhone: jobList[0].phone,
      formData: { circuit: "Kitchen socket", result: "Pass", notes: "E2E" },
    },
  });
  log(cert.ok, "create certificate", cert.json?.id);
  let signed = null;
  if (cert.ok) {
    signed = await req("POST", `/api/t/certificates/${cert.json.id}/sign`, {
      token,
      body: {
        signatureDataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      },
    });
    log(signed.ok && !!signed.json?.pdfUrl, "sign certificate + PDF", signed.json?.pdfUrl);
    if (signed.ok) {
      const sent = await req("POST", `/api/t/certificates/${cert.json.id}/send`, { token, body: {} });
      log(sent.ok && sent.json?.status === "SENT", "send certificate SMS", sent.json?.status);
      const pub = await req("GET", `/cert/${signed.json.publicToken}?download=0`);
      log(pub.ok, "public cert page", `status=${pub.status}`);
    }
  }

  // Quote with deposit + PDF
  const draft = await req("POST", `/api/t/jobs/${jobId}/notes`, {
    token,
    body: { transcript: "Replace stopcock and copper pipe. Labour and fittings." },
  });
  log(draft.ok || draft.status === 201, "notes→quote", draft.json?.id);
  if (draft.json?.id) {
    const priced = await req("PUT", `/api/t/quotes/${draft.json.id}/lines`, {
      token,
      body: {
        lines: [
          { label: "Labour", qty: 2, unit: "HOUR", unitPricePence: 5500, vatRate: 20 },
          { label: "Fittings", qty: 1, unit: "EACH", unitPricePence: 1800, vatRate: 20 },
        ],
      },
    });
    log(priced.ok && priced.json?.totalPence > 0, "price quote lines", `total=${priced.json?.totalPence}`);
    const approved = await req("POST", `/api/t/quotes/${draft.json.id}/approve`, {
      token,
      body: { depositPercent: 25 },
    });
    log(
      approved.ok && approved.json?.depositPence > 0,
      "approve with 25% deposit",
      approved.ok
        ? `deposit=${approved.json.depositPence} pdf=${approved.json.pdfUrl} url=${approved.json.publicUrl}`
        : approved.text
    );
    if (approved.ok) {
      const tok = (approved.json.publicUrl || "").split("/q/")[1];
      if (tok) {
        const pq = await req("GET", `/q/${tok}`);
        log(pq.ok && pq.text.includes("Deposit"), "public quote shows deposit", `urlHost=${approved.json.publicUrl}`);
        if (approved.json.publicUrl?.includes(":5173") && !process.env.APP_PUBLIC_URL) {
          findings.push({
            sev: "high",
            msg: `Quote publicUrl uses :5173 (${approved.json.publicUrl}) but Vite is often on :5174 — customers opening SMS links may hit wrong/dead app shell; API /q/:token still works on :4000`,
          });
        }
      }
      if (!approved.json.pdfUrl) findings.push({ sev: "med", msg: "Quote approve succeeded without pdfUrl" });
    }
  }

  // Invoice send + public + mark paid + review schedule
  const invs = await req("GET", "/api/t/invoices", { token });
  const invList = Array.isArray(invs.json) ? invs.json : [];
  let inv = invList.find((i) => i.status === "DRAFT") || invList.find((i) => i.status === "SENT");
  if (inv?.status === "DRAFT") {
    const sentInv = await req("POST", `/api/t/invoices/${inv.id}/send`, { token, body: {} });
    log(sentInv.ok && !!sentInv.json?.invoice?.pdfUrl, "send invoice + PDF", sentInv.json?.publicUrl);
    inv = sentInv.json?.invoice || inv;
    const itok = (sentInv.json?.publicUrl || "").split("/i/")[1];
    if (itok) {
      const pi = await req("GET", `/i/${itok}`);
      log(pi.ok && pi.text.includes("bank"), "public invoice page", `payNow=${/Pay now/i.test(pi.text)}`);
      const pay = await req("POST", `/i/${itok}/pay`);
      log(pay.status === 400 && pay.json?.error?.code === "connect_required", "Pay Now blocked without Connect", pay.json?.error?.code);
    }
  }
  if (inv?.id && inv.status !== "PAID") {
    // refresh status
    const again = await req("GET", "/api/t/invoices", { token });
    inv = (Array.isArray(again.json) ? again.json : []).find((i) => i.id === inv.id) || inv;
  }
  const toPay = (Array.isArray(invs.json) ? invs.json : []).find((i) => i.status === "SENT") || inv;
  if (toPay?.id) {
    const paid = await req("POST", `/api/t/invoices/${toPay.id}/mark-paid`, { token, body: {} });
    log(paid.ok && paid.json?.status === "PAID", "mark-paid", paid.json?.status || paid.text);
  }

  // Settings
  const patch = await req("PATCH", "/api/t/me", {
    token,
    body: { googleReviewUrl: "https://g.page/r/e2e-review-test", defaultDepositPercent: 30 },
  });
  log(patch.ok, "PATCH settings review+deposit");

  // Follow-ups via prisma
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const fus = await prisma.followUp.findMany({
    where: {
      kind: { in: ["SERVICE_REMINDER", "REVIEW_ASK", "REVIEW_NUDGE", "APPT_REMINDER", "INVOICE_D3", "INVOICE_D7"] },
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  const kinds = Object.fromEntries(
    ["SERVICE_REMINDER", "REVIEW_ASK", "REVIEW_NUDGE", "APPT_REMINDER"].map((k) => [
      k,
      fus.filter((f) => f.kind === k).length,
    ])
  );
  log(kinds.SERVICE_REMINDER > 0, "SERVICE_REMINDER scheduled", `count=${kinds.SERVICE_REMINDER}`);
  log(kinds.APPT_REMINDER > 0, "APPT_REMINDER scheduled", `count=${kinds.APPT_REMINDER}`);
  log(kinds.REVIEW_ASK > 0, "REVIEW_ASK after paid", `count=${kinds.REVIEW_ASK} nudge=${kinds.REVIEW_NUDGE}`);
  if (kinds.REVIEW_ASK === 0) {
    findings.push({
      sev: "med",
      msg: "No REVIEW_ASK follow-ups — mark-paid schedules reviews only when googleReviewUrl is set BEFORE mark-paid; order of operations matters",
    });
  }
  await prisma.$disconnect();

  console.log("\n=== FINDINGS ===");
  if (!findings.length) console.log("(none critical beyond env gaps)");
  for (const f of findings) console.log(`[${f.sev}] ${f.msg}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
