# Tradies Mate — Lead Engine

A local web app that finds UK tradespeople who lack a **real** website, qualifies and
scores them for outreach, and tracks them through a pipeline.

It goes beyond a "has website yes/no" check: every business is **classified**
(`NONE` / `SOCIAL_ONLY` / `DIRECTORY_ONLY` / `PROPER` / `PROPER_DEAD`), dead sites are
detected with a live reachability check, closed businesses and no-phone rows are gated
out, `.co.uk` domain availability is checked, and a **two-stage** model separates
qualification (in/out) from a 0–100 priority score.

## Stack

- **Frontend:** Vite + React + TypeScript, TanStack Query, Leaflet map
- **Backend:** Node + Express + TypeScript, Bottleneck (rate limiting), zod (validation)
- **Data:** PostgreSQL + Prisma
- **Source:** Google Places API (New)

```
traders-mate-app/
├── server/   # Express API + Prisma + lead pipeline
└── client/   # React app
```

## Prerequisites

- Node 20+
- PostgreSQL 15+ running locally
- A Google Cloud project with the **Places API (New)** enabled and billing on

## Setup

### 1. Backend

```bash
cd server
cp .env.example .env          # then set GOOGLE_PLACES_API_KEY and DATABASE_URL
npm install
npm run prisma:migrate        # creates tables
npm run dev                   # http://localhost:4000
```

### 2. Frontend

```bash
cd client
npm install
npm run dev                   # http://localhost:5173
```

The client proxies `/api` to `http://localhost:4000` (see `client/vite.config.ts`).

## Using it

1. Open http://localhost:5173.
2. **Search:** enter an occupation (e.g. `electrician`) and a town (e.g. `Woking`), or
   switch to map mode and drop a pin + set a radius. Submit.
3. **Leads:** qualified leads appear sorted by priority score. Filter by website class,
   reviews, rating, score, occupation, town and status. Sort by clicking column headers.
4. Click a business to open the detail drawer — edit notes, mark it TPS-screened,
   or refresh it from Google.
5. Select rows and **Export CSV** (or export all qualified leads).

## Website generator

From a lead's detail drawer, **Build demo site** generates a complete, self-contained,
mobile-first single-page website for that business and opens a live preview. This is the
"build the demo before you call" tactic — you show a finished site with their name, trade,
town and Google rating already on it.

Each generated site includes: a hero with click-to-call, a services grid (trade-specific
copy), an about section, a gallery (placeholder tiles to swap for real photos), reviews,
an "areas we cover" block, a contact form (opens a pre-filled email) and a Google Map
embed — plus **LocalBusiness JSON-LD schema**, town-in-title SEO, and a sticky mobile call
bar. Everything is inlined into one `index.html` with no external build step.

- **Preview:** served at `/sites/<slug>/` by the API.
- **Download:** "Download HTML" gives you the single file to drag into Cloudflare Pages
  (or any static host).
- **Content:** trade copy lives in `server/src/services/site/content.ts`; the template
  is `server/src/services/site/template.ts`. Pass overrides (email, custom services,
  areas, real reviews, colours) to `POST /api/leads/:id/site` to tailor a site.

Each trade gets its own colour identity, brand monogram and icon set, plus motion
(animated hero, counting stats, scroll reveals) so the result looks bespoke — not
AI-generic. Testimonials are clearly-marked placeholders until you paste the business's
real Google reviews. Sample outputs: `traders-mate-app/sample-electrician.html`,
`sample-plumber.html`, `sample-painter.html`.

## Lead routing, CRM & messaging (Phase 1–2)

Turns a website into a lead machine: an enquiry from any client's site is routed to the
right tradie's WhatsApp/SMS, tracked by us, and gated on payment.

**The rule:** the tradie's number never lives in the site. Each converted client gets a
public `routeKey`; the site posts to our app, which resolves the client, checks they're
paying, then routes and logs.

- **Convert a prospect:** `POST /api/clients/from-lead/:leadId` mints a `routeKey` and a
  `Client` (CRM tenant) with destination number, channel, status and custom message templates.
- **Public intake:** `POST /api/intake` `{ routeKey, name, phone, message?, photos?, source }`
  — looks up the client, applies the **payment gate** (`ACTIVE` → route now; `PAST_DUE`/
  `SUSPENDED` → store as `HELD` and don't deliver), stores the `Enquiry`, then delivers to the
  tradie and auto-acknowledges the customer. Honeypot + per-IP rate limiting.
- **Gated buttons:** `GET /c/:routeKey/call` and `/c/:routeKey/whatsapp` 302-redirect to the
  real `tel:`/`wa.me` only if the client is `ACTIVE` — so calls are gated and trackable too.
- **Messaging:** Twilio SMS/WhatsApp behind an interface, **forwarding to the tradie's own
  number**. With no Twilio credentials it falls back to a logging stub, so the whole flow
  works in dev/demo. UK numbers are normalised to E.164.
- **Generated sites** carry the routing automatically when built for a client: pass
  `routeKey` + `intakeBase` to the generator and the quote form posts to `/api/intake` while
  the call/WhatsApp buttons use the gated redirects. Without them, the site falls back to
  `tel:`/`mailto:` (demo mode). See `sample-plumber-routed.html` vs `sample-plumber.html`.

Config in `server/.env`: `TWILIO_ACCOUNT_SID/AUTH_TOKEN/SMS_FROM/WHATSAPP_FROM`,
`PUBLIC_BASE_URL`, `INTAKE_RATE_MAX`. Because this adds `Client`/`Enquiry` models, run
`npm run prisma:migrate` again after pulling these changes.

### Billing, widget, uploads & CRM (now built)

- **Stripe billing** — `POST /api/billing/checkout/:clientId` starts a subscription (stub URL
  when Stripe isn't configured). `POST /webhooks/stripe` verifies the signature and
  auto-flips `Client.status` on payment events (`invoice.paid` → ACTIVE,
  `payment_failed` → PAST_DUE, `subscription.deleted` → CANCELLED). Stop paying → leads auto-hold.
- **Embeddable widget** — `GET /widget.js`. A client who already has a website adds ONE line:
  `<script src="https://<host>/widget.js" data-key="tm_xxx" defer></script>`. It injects a
  floating (or inline, via `data-mode="inline" data-target="#contact"`) quote form with photo
  upload, posting to `/api/intake`. The Client drawer shows the exact snippet to copy.
- **Photo uploads** — `POST /api/upload` (base64, type/size-validated) stores images and returns
  URLs, served from `/uploads`. The site form and widget attach photos to the enquiry. Storage is
  behind an interface (local now; swap for S3/R2 later).
- **Client CRM (frontend)** — a **Clients** page lists tenants with "leads (30d)" and held counts;
  the drawer edits status, destination number/channel and custom message templates, shows the
  embed snippet and recent enquiries, and opens billing. Convert a prospect with **Convert to
  client** in the Lead drawer.

Config in `server/.env`: `STRIPE_SECRET_KEY/WEBHOOK_SECRET/PRICE_ID`. Point your Stripe webhook
at `/webhooks/stripe`. Run `npm run prisma:migrate` after pulling (adds `Client`/`Enquiry`).

## How a lead is qualified and scored

**Qualification gate** (all must pass, else stored but `qualified = false`):

| Check | Rule |
|-------|------|
| Open | `businessStatus == OPERATIONAL` |
| Contactable | has a phone number |
| Needs a site | website class ∈ {NONE, SOCIAL_ONLY, DIRECTORY_ONLY, PROPER_DEAD} |

**Priority score (0–100)** for qualified leads, weighted over: website class
(SOCIAL_ONLY and PROPER_DEAD score highest — easiest yes), review activity + recency,
rating band (4.2–4.9 sweet spot; a lone 5.0 is treated cautiously), trade value,
domain availability, and whether the phone is a mobile.

Tune the weights in `server/src/config/scoring.ts`, the trade values in
`server/src/config/trades.ts`, and the social/directory domain lists in
`server/src/config/domains.ts`.

## Configuration (`server/.env`)

| Var | Purpose |
|-----|---------|
| `GOOGLE_PLACES_API_KEY` | Places API (New) key |
| `DATABASE_URL` | PostgreSQL connection string |
| `PLACES_MAX_QPS` | Outbound rate limit to Google |
| `ENABLE_REVIEW_RECENCY` | Request `reviews` field for recency scoring (costs more) |
| `WEBSITE_CHECK_TIMEOUT_MS` | Reachability check timeout |
| `DOMAIN_CHECK_PROVIDER` | `rdap` (default), `ionos`, or `off` |
| `IONOS_API_KEY` / `IONOS_API_SECRET` | IONOS **reseller/developer** API creds (only if provider=ionos) |
| `IONOS_API_BASE` / `IONOS_AVAILABILITY_PATH` | IONOS API base + availability path (`{domain}` substituted) |
| `IONOS_AFFILIATE_ID` / `IONOS_AFFILIATE_LINK_TEMPLATE` | Affiliate (CJ/Awin) tracking id + tracked deep-link template |
| `SEARCH_RATE_MAX` | Inbound `/api/search` rate limit |

### IONOS: affiliate vs API (important)

These are two different things:

- **Affiliate program (CJ/Awin)** — what "IONOS affiliate" normally means. You get a
  *tracked referral link* and earn commission when someone registers through it. There is
  **no availability/registration API** with an affiliate account. Set
  `IONOS_AFFILIATE_LINK_TEMPLATE` (and `IONOS_AFFILIATE_ID`) to your network deep link;
  every qualified lead then carries a "Register via IONOS" link (in the drawer and CSV)
  pointing at its suggested domain. Leave `DOMAIN_CHECK_PROVIDER=rdap`.
- **Reseller/developer API** — a separate account with real API credentials
  (`X-API-Key: <prefix>.<secret>`). Only this can check availability programmatically.
  If you have it, set `DOMAIN_CHECK_PROVIDER=ionos` and the `IONOS_API_*` vars. Confirm the
  exact availability path in your IONOS API console and put it in `IONOS_AVAILABILITY_PATH`;
  the response parser (`server/src/services/ionos.ts`) is deliberately permissive.

By default the app checks availability with **RDAP** (free, no account) and uses IONOS
purely for the affiliate registration link — which is the right setup for an affiliate.

## Tests

Pure classification, scoring, domain and slug logic have assertions:

```bash
cd server && npm test
```

## Compliance notes (important)

- **This app does not contact anyone.** It only finds and organises leads.
- Only the Google **Place ID** is stored as a permanent key; other Google fields are
  refreshable (use "Refresh from Google" on a lead). This respects Places caching terms.
- Before calling any lead, screen the number against **TPS and CTPS** and record the
  date (the drawer has a "Mark TPS-screened" action). Do **not** cold-email sole traders.
  See the separate system plan for the full legal picture.

## Notes on the Places integration

- Text Search is used for town queries; Nearby Search for map + radius. Some occupations
  don't map to a Google `includedType`, so map-mode falls back to a broad nearby query —
  refine `server/src/services/places.ts` if you need tighter type filtering.
- The field mask requests only the fields used, to keep the SKU/cost down.
```
