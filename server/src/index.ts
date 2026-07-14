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
import { getGooglePlacesApiKey, twilioConfigured, claudeConfigured } from "./settings.js";
import { SITES_DIR } from "./services/site/generate.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { tickFollowUps } from "./services/quotes/followups.js";

const app = express();
const allowedOrigins = clientOrigins();

// Stripe webhook needs the RAW body for signature verification (before json parsing).
app.use("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookRouter);

// Public, cross-origin surfaces (registered BEFORE the restrictive app CORS):
// lead intake + photo uploads from any client site, the gated redirects, and the widget.
app.use("/api/intake", cors(), express.json({ limit: "1mb" }), intakeRouter);
app.use("/api/upload", cors(), express.json({ limit: "12mb" }), uploadRouter);
app.use("/api/t", cors({ origin: true, credentials: true }), express.json({ limit: "20mb" }), tradieRouter);
app.use("/q", cors(), express.urlencoded({ extended: true }), express.json(), quotePublicRouter);
app.use("/api/followups", express.json(), followupsRouter);
app.use("/c", redirectRouter);
app.use(widgetRouter); // GET /widget.js
app.use("/uploads", express.static(UPLOADS_DIR));

app.use(
  cors({
    origin(origin, cb) {
      // Non-browser clients (no Origin) or exact allow-list match.
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    placesConfigured: !!getGooglePlacesApiKey(),
    twilioConfigured: twilioConfigured(),
    claudeConfigured: claudeConfigured(),
    publicBaseUrl: env.PUBLIC_BASE_URL,
    time: new Date().toISOString(),
  });
});

app.use("/api/settings", settingsRouter);
app.use("/api/search", searchRouter);
app.use("/api/leads", leadsRouter);
app.use("/api/leads", sitesRouter); // /api/leads/:id/site
app.use("/api/clients", clientsRouter);
app.use("/api/billing", billingRouter);
app.use("/api/search-runs", searchRunsRouter);

// Serve generated demo sites for preview (e.g. /sites/<slug>/)
app.use("/sites", express.static(SITES_DIR));

app.use(notFound);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`[traders-mate] API listening on http://localhost:${env.PORT}`);
  if (!getGooglePlacesApiKey()) {
    console.warn("[traders-mate] GOOGLE_PLACES_API_KEY is not set — searches will fail until it is.");
  }
  // Quote follow-up ticker (additive — no effect until quotes are SENT).
  setInterval(() => {
    void tickFollowUps().catch((e) => console.warn("[followups]", e instanceof Error ? e.message : e));
  }, 5 * 60 * 1000);
});
