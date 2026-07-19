import express from "express";
import cors from "cors";
import { env, clientOrigins } from "./env.js";
import { searchRouter } from "./routes/search.js";
import { leadsRouter } from "./routes/leads.js";
import { searchRunsRouter } from "./routes/searchRuns.js";
import { sitesRouter } from "./routes/sites.js";
import { settingsRouter } from "./routes/settings.js";
import { clientsRouter } from "./routes/clients.js";
import { intakeRouter, redirectRouter } from "./routes/intake.js";
import { uploadRouter } from "./routes/upload.js";
import { billingRouter } from "./routes/billing.js";
import { stripeWebhookRouter } from "./routes/stripeWebhook.js";
import { widgetRouter } from "./routes/widget.js";
import { tradieRouter } from "./routes/tradie.js";
import { quotePublicRouter, followupsRouter } from "./routes/quotePublic.js";
import { UPLOADS_DIR } from "./services/storage/store.js";
import { getGooglePlacesApiKey, twilioConfigured, claudeConfigured, openaiConfigured } from "./settings.js";
import { SITES_DIR } from "./services/site/generate.js";
import { errorHandler, notFound, ApiError } from "./middleware/error.js";
import {
  requireOperator,
  operatorAuthConfigured,
  issueOperatorSession,
  verifyLoginPassword,
} from "./middleware/operatorAuth.js";
import { tickFollowUps } from "./services/quotes/followups.js";
import { signupRouter } from "./routes/signup.js";
import { earlyAccessRouter } from "./routes/earlyAccess.js";
import { invoicePublicRouter } from "./routes/invoicePublic.js";
import { twilioHooksRouter } from "./routes/twilioHooks.js";
import { inboundEmailRouter } from "./routes/inboundEmail.js";

const app = express();
// Railway / reverse proxies — needed for correct client IP on rate limits.
app.set("trust proxy", 1);
const allowedOrigins = new Set(clientOrigins().map((o) => o.replace(/\/$/, "")));

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, "");
  if (allowedOrigins.has(normalized)) return true;
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    // Admin UI is hosted on Vercel (prod + preview deployments).
    if (host.endsWith(".vercel.app")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

const crmCors = cors({
  origin(origin, cb) {
    if (isAllowedOrigin(origin)) return cb(null, true);
    console.warn("[cors] blocked origin:", origin);
    return cb(null, false);
  },
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-operator-token"],
  maxAge: 86400,
});

// Stripe webhook needs the RAW body for signature verification (before json parsing).
app.use("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);

// Public, cross-origin surfaces (registered BEFORE the restrictive app CORS):
// lead intake + photo uploads from any client site, the gated redirects, and the widget.
app.use("/api/intake", cors(), express.json({ limit: "1mb" }), intakeRouter);
app.use("/api/upload", cors(), express.json({ limit: "12mb" }), uploadRouter);
app.use("/api/t", cors({ origin: true, credentials: true }), express.json({ limit: "20mb" }), tradieRouter);
app.use("/api/signup", cors({ origin: true }), express.json(), signupRouter);
app.use("/q", cors(), express.urlencoded({ extended: true }), express.json(), quotePublicRouter);
app.use("/i", cors(), express.urlencoded({ extended: true }), express.json(), invoicePublicRouter);
app.use("/api/followups", express.json(), followupsRouter);
app.use("/api/twilio", cors(), express.urlencoded({ extended: true }), express.json(), twilioHooksRouter);
app.use("/api/inbound-email", cors(), express.json({ limit: "2mb" }), inboundEmailRouter);
app.use("/c", redirectRouter);
app.use(widgetRouter); // GET /widget.js
app.use("/uploads", express.static(UPLOADS_DIR));

// CRM / admin API — allow configured origins + *.vercel.app
app.use("/api", crmCors);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    placesConfigured: !!getGooglePlacesApiKey(),
    twilioConfigured: twilioConfigured(),
    claudeConfigured: claudeConfigured(),
    openaiConfigured: openaiConfigured(),
    publicBaseUrl: env.PUBLIC_BASE_URL,
    appPublicUrl: env.APP_PUBLIC_URL?.trim() || null,
    clientOrigins: [...allowedOrigins],
    operatorAuthRequired: operatorAuthConfigured(),
    signupsOpen: env.SIGNUPS_OPEN,
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RAILWAY_GIT_COMMIT ||
      process.env.GIT_COMMIT ||
      null,
    voiceRescue: "vm-mode-v3",
    time: new Date().toISOString(),
  });
});

/** Lightweight probe used by the admin login screen. */
app.get("/api/operator/session", requireOperator, (_req, res) => {
  res.json({ ok: true, authRequired: operatorAuthConfigured() });
});

/** Password login → signed session (14 days). */
app.post("/api/operator/login", (req, res, next) => {
  try {
    if (!operatorAuthConfigured()) {
      res.json({ ok: true, open: true, sessionToken: null, expiresAt: null });
      return;
    }
    const password = String(req.body?.password || "");
    if (!verifyLoginPassword(password)) {
      throw new ApiError(401, "unauthorized", "Incorrect password");
    }
    const session = issueOperatorSession();
    res.json({ ok: true, open: false, ...session });
  } catch (err) {
    next(err);
  }
});

app.use("/api/settings", requireOperator, settingsRouter);
app.use("/api/search", requireOperator, searchRouter);
app.use("/api/leads", requireOperator, leadsRouter);
app.use("/api/leads", requireOperator, sitesRouter); // /api/leads/:id/site
app.use("/api/clients", requireOperator, clientsRouter);
app.use("/api/billing", requireOperator, billingRouter);
app.use("/api/search-runs", requireOperator, searchRunsRouter);
app.use("/api/early-access", requireOperator, earlyAccessRouter);

// Serve generated demo sites for preview (e.g. /sites/<slug>/)
app.use("/sites", express.static(SITES_DIR));

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`[tradiesmate] API listening on http://localhost:${env.PORT}`);
  if (!getGooglePlacesApiKey()) {
    console.warn("[tradiesmate] GOOGLE_PLACES_API_KEY is not set — searches will fail until it is.");
  }
  // Quote follow-up ticker (additive — no effect until quotes are SENT).
  setInterval(() => {
    void tickFollowUps().catch((e) => console.warn("[followups]", e instanceof Error ? e.message : e));
  }, 5 * 60 * 1000);
});
