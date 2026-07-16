// Centralised, validated environment access.
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/tradersmate?schema=public"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),

  GOOGLE_PLACES_API_KEY: z.string().default(""),
  PLACES_MAX_QPS: z.coerce.number().default(8),
  ENABLE_REVIEW_RECENCY: z.string().default("false").transform((v) => v === "true" || v === "1"),

  WEBSITE_CHECK_TIMEOUT_MS: z.coerce.number().default(5000),
  WEBSITE_CHECK_CONCURRENCY: z.coerce.number().default(10),

  // Availability provider. RDAP is free + needs no account (default). "ionos" needs API creds.
  DOMAIN_CHECK_PROVIDER: z.enum(["rdap", "ionos", "off"]).default("rdap"),
  IONOS_API_KEY: z.string().default(""),
  IONOS_API_SECRET: z.string().default(""),
  IONOS_API_BASE: z.string().default("https://api.hosting.ionos.com"),
  IONOS_AVAILABILITY_PATH: z.string().default("/domains/v1/domainitems?domain={domain}"),
  IONOS_AFFILIATE_ID: z.string().default(""),
  IONOS_AFFILIATE_LINK_TEMPLATE: z.string().default("https://www.ionos.co.uk/domains/domain-names?domain={domain}"),

  SEARCH_RATE_WINDOW_MS: z.coerce.number().default(60000),
  SEARCH_RATE_MAX: z.coerce.number().default(20),

  // Public base URL of the intake service (form actions / redirects / widget).
  PUBLIC_BASE_URL: z
    .string()
    .default("http://localhost:4000")
    .transform((v) => {
      const t = v.trim().replace(/\/$/, "");
      if (!t) return "http://localhost:4000";
      if (/^https?:\/\//i.test(t)) return t;
      return `https://${t}`;
    }),

  // Twilio (forwarding model). Absent creds -> logging stub, so the flow still works.
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_SMS_FROM: z.string().default(""),
  TWILIO_WHATSAPP_FROM: z.string().default(""),

  // Quote AI (Claude Haiku 4.5 for extract; optional OpenAI Whisper for voice)
  CLAUDE_API_KEY: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  MAGIC_LINK_SECRET: z.string().default("dev-magic-link-secret-change-me"),
  // Public URL for tradie PWA + customer quote pages (defaults to CLIENT_ORIGIN).
  APP_PUBLIC_URL: z.string().default(""),

  INTAKE_RATE_WINDOW_MS: z.coerce.number().default(60000),
  INTAKE_RATE_MAX: z.coerce.number().default(30),

  // Stripe billing (auto-flips client status via webhook). Stub-safe when blank.
  STRIPE_SECRET_KEY: z.string().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().default(""),
  STRIPE_PRICE_ID: z.string().default(""),
  STRIPE_SUCCESS_URL: z.string().default(""),
  STRIPE_CANCEL_URL: z.string().default(""),

  // Operator CRM protection (Bearer / x-operator-token). Empty = open (local/dev).
  OPERATOR_API_TOKEN: z.string().default(""),

  // Self-serve trial length (days).
  TRIAL_DAYS: z.coerce.number().default(14),

  // Inbound email domain local-part@INBOUND_EMAIL_DOMAIN
  INBOUND_EMAIL_DOMAIN: z.string().default("in.tradersmate.co.uk"),
  INBOUND_EMAIL_WEBHOOK_SECRET: z.string().default(""),
});

export const env = schema.parse(process.env);
export type Env = typeof env;

/** Comma-separated CLIENT_ORIGIN support (local + Vercel). */
export function clientOrigins(): string[] {
  return env.CLIENT_ORIGIN.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
