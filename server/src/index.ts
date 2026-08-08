import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
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
import { customerRouter } from "./routes/customers.js";
import { jobsRouter } from "./routes/jobs.js";
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
import { dashboardRouter } from "./routes/dashboard.js";
import { twilioAdminRouter } from "./routes/twilioAdmin.js";
import { invoicePublicRouter } from "./routes/invoicePublic.js";
import { certPublicRouter } from "./routes/certPublic.js";
import { twilioHooksRouter } from "./routes/twilioHooks.js";
import { publicGreetingRouter } from "./routes/publicGreeting.js";
import { inboundEmailRouter } from "./routes/inboundEmail.js";
import { filesRouter } from "./routes/files.js";

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

const operatorLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Too many login attempts — try again later." } },
});

// Stripe webhook needs the RAW body for signature verification (before json parsing).
app.use("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);

// Public, cross-origin surfaces (registered BEFORE the restrictive app CORS):
// lead intake + photo uploads from any client site, the gated redirects, and the widget.
app.use("/api/intake", cors(), express.json({ limit: "1mb" }), intakeRouter);
app.use("/api/upload", cors(), express.json({ limit: "12mb" }), uploadRouter);
// customerRouter first: it owns /customers now, and its routes must win over
// anything left in the older router.
app.use("/api/t", cors({ origin: true, credentials: true }), express.json({ limit: "20mb" }), customerRouter);
// jobsRouter owns every /jobs path. tradieRouter no longer defines any, so this
// is ordering for clarity rather than precedence — but if one ever creeps back
// in, the newer implementation is the one that should win.
app.use("/api/t", cors({ origin: true, credentials: true }), express.json({ limit: "20mb" }), jobsRouter);
app.use("/api/t", cors({ origin: true, credentials: true }), express.json({ limit: "20mb" }), tradieRouter);
app.use("/api/signup", cors({ origin: true }), express.json(), signupRouter);
app.use("/q", cors(), express.urlencoded({ extended: true }), express.json(), quotePublicRouter);
app.use("/i", cors(), express.urlencoded({ extended: true }), express.json(), invoicePublicRouter);
app.use("/cert", cors(), certPublicRouter);
app.use("/api/followups", express.json(), followupsRouter);
app.use("/api/twilio", cors(), express.urlencoded({ extended: true }), express.json(), twilioHooksRouter);
app.use("/api/public/greeting", cors(), publicGreetingRouter);
app.use("/api/inbound-email", cors(), express.json({ limit: "2mb" }), inboundEmailRouter);
app.use("/api/files", cors(), filesRouter);
app.use("/c", redirectRouter);
app.use(widgetRouter); // GET /widget.js
// Public uploads only — block private/certs/pdfs trees (signed /api/files required).
app.use("/uploads", (req, res, next) => {
  const p = (req.path || "").replace(/^\/+/, "");
  if (
    p.startsWith("private/") ||
    p.startsWith("certs/") ||
    p.startsWith("pdfs/") ||
    p === "private" ||
    p === "certs" ||
    p === "pdfs"
  ) {
    res.status(404).json({ error: { code: "not_found", message: "Use a signed file URL" } });
    return;
  }
  next();
});
app.use("/uploads", express.static(UPLOADS_DIR));

// CRM / admin API — allow configured origins + *.vercel.app
app.use("/api", crmCors);
app.use(express.json({ limit: "1mb" }));

/** Public liveness + minimal flags the admin UI needs before login. */
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    placesConfigured: !!getGooglePlacesApiKey(),
    operatorAuthRequired: operatorAuthConfigured(),
    signupsOpen: env.SIGNUPS_OPEN,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    time: new Date().toISOString(),
  });
});

/** Operator-only diagnostics (integrations, pool, commit). */
app.get("/api/health/detail", requireOperator, async (_req, res) => {
  const { getTwilioUkBundleSid } = await import("./services/appConfig.js");
  const { countAvailablePoolNumbers } = await import("./services/twilio/numberPool.js");
  const ukBundle = await getTwilioUkBundleSid().catch(() => "");
  const poolAvailable = await countAvailablePoolNumbers().catch(() => 0);
  res.json({
    ok: true,
    placesConfigured: !!getGooglePlacesApiKey(),
    twilioConfigured: twilioConfigured(),
    twilioUkBundleConfigured: !!ukBundle,
    twilioPoolAvailable: poolAvailable,
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
    voiceRescue: "vm-mode-v4",
    time: new Date().toISOString(),
  });
});

/** Lightweight probe used by the admin login screen. */
app.get("/api/operator/session", requireOperator, (_req, res) => {
  res.json({ ok: true, authRequired: operatorAuthConfigured() });
});

/** Password login → signed session (14 days). */
app.post("/api/operator/login", operatorLoginLimiter, (req, res, next) => {
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
app.use("/api/dashboard", requireOperator, dashboardRouter);
app.use("/api/twilio-admin", requireOperator, twilioAdminRouter);

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
