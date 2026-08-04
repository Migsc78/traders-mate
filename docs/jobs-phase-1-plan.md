# Jobs, Pipeline & Job Profit — Phase 1 execution plan

Derived from `TradesMate_Jobs_Workflow_PRD_and_Wireframes.pdf` (v1.0, 4 Aug 2026) with two
owner amendments:

1. **No rename.** The pipeline stays **Jobs**, not "Work". Bottom nav is unchanged.
2. **Enquiries live in the Inbox**, not as a tab inside Jobs. Qualified missed calls arrive
   there; manual ones are created with the Inbox `+`. Promoting from Inbox creates a Job.

Agreed decisions carried in:

- Labour cost defaults to **£0**, with an optional "my cost per hour" in Settings. Job profit
  reads as money in your pocket: revenue − materials − expenses. Not asked during onboarding.
- Variations are **not** a four-state approval workflow. An extra is a cost line flagged
  `isExtra` with `agreedAt` / `agreedVia`.
- Job activity is **stored**, not derived (unlike the customer timeline — see §2.5).
- Access-code reveal audit is **un-deferred** and lands in this phase.

Out of this phase, deliberately: checklists/tasks, multi-engineer assignment, staff logins and
roles, quote-template changes, route optimisation.

---

## 1. What's actually there today

Established by reading the code, not assumed:

| Thing | Reality |
|---|---|
| `Job` model | **Does not exist.** `/t/jobs` = `Enquiry where pipeline='JOB'` |
| Job status | Derived from latest quote — `tabOf()` in `TradieJobsPage.tsx:36` |
| Job routes | ~12 handlers in `tradie.ts`, all `/jobs/:enquiryId` |
| Enquiry/Inbox | Already complete: `pipeline`, `triage`, `source`, `summary`, promote/kill |
| Visits | `Appointment` — has `ON_THE_WAY`, `startsAt/endsAt`, `enquiryId`, drives the Diary |
| Cost price | **Nowhere.** `PriceBookItem` and `QuoteLine` hold sell price only |
| Bottom nav | Diary · Inbox · Jobs · Quotes · Customers · More — already matches the PRD |

Two consequences that shape everything below:

- A job that's been **done but not billed** is indistinguishable from one that's been
  **quoted but not started**. Both render as "Won". That is the defect this phase fixes.
- `Appointment` is already 80% of the PRD's `Visit`. It gets extended, not replaced, so the
  Diary keeps working with no migration of scheduled work.

---

## 2. Data model

All changes are **additive**. No column is dropped or retyped, so the migration cannot lose
data even though the current data is all test data.

### 2.1 `Job` — the missing entity

```prisma
enum JobOperational { UNSCHEDULED SCHEDULED ON_THE_WAY IN_PROGRESS PAUSED COMPLETED CANCELLED }
enum JobCommercial  { UNQUOTED QUOTED DEPOSIT_DUE DEPOSIT_PAID READY_TO_INVOICE INVOICE_SENT PAID }

model Job {
  id               String  @id          // reuses source Enquiry.id — see §3.2
  clientId         String
  enquiryId        String?              // source enquiry, kept for provenance
  quoteId          String?              // accepted commercial baseline, immutable
  customerId       String?
  propertyId       String?
  siteContactId    String?
  reference        String?              // "J-1042", per client
  title            String
  scope            String?
  operational      JobOperational @default(UNSCHEDULED)
  commercial       JobCommercial  @default(UNQUOTED)
  quotedTotalPence Int @default(0)      // ex-VAT accepted baseline
  depositPaidPence Int @default(0)
  startedAt        DateTime?
  completedAt      DateTime?
  archivedAt       DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

`UNQUOTED` is the default because a direct call-out has no quote — the PRD's list starts at
`Quoted` and has no state for the emergency-leak path it also specifies.

`PAUSED` is modelled but not exposed in the UI this phase.

### 2.2 `Appointment` becomes the Visit

Additive columns only:

```prisma
jobId              String?
kind               String?     // Survey | First fix | Return with part | Final | Service
arrivalWindowStart DateTime?
arrivalWindowEnd   DateTime?
completedAt        DateTime?
```

A job creates one visit by default. The Visits tab only appears once there's a second one or
the tradie taps Add visit. Because a visit *is* an appointment, the diary entry is automatic —
there is nothing to keep in sync.

### 2.3 Cost price — the P&L foundation

```prisma
PriceBookItem.costPricePence  Int?   // nullable on purpose
QuoteLine.costPricePence      Int?   // snapshot at quote time
Client.labourCostPerHourPence Int?   // null = £0 = my own time
```

**Nullable is load-bearing.** An item with no cost set must render as "cost not set", never as
100% margin. A confidently wrong profit figure is worse than an absent one.

`QuoteLine` snapshots the cost because merchant prices move — the margin you want to see is the
one you expected when you priced the job, not one that silently rewrites itself in June.

### 2.4 `JobCost`

```prisma
enum JobCostType { MATERIAL LABOUR EXPENSE SUBCONTRACTOR }

model JobCost {
  id, clientId, jobId
  type            JobCostType
  label           String
  qty             Float     @default(1)
  unit            PriceUnit @default(JOB)
  unitCostPence   Int       @default(0)   // what it cost me
  sellPricePence  Int       @default(0)   // what I charge
  vatRate         Float     @default(20)
  billable        Boolean   @default(true)
  priceBookItemId String?
  isExtra         Boolean   @default(false)  // beyond the accepted quote
  agreedAt        DateTime?                  // when the customer said yes
  agreedVia       String?                    // phone | in person | message
  receiptFileId   String?                    // CustomerFile
  invoicedAt      DateTime?
  source          String    @default("MANUAL") // QUOTE | BOOK | MANUAL
}
```

`isExtra` + `agreedAt` is the whole of "variations". It records that the agreement happened,
which is the part with value, and skips the state machine nobody would drive.

### 2.5 `JobEvent` — stored, not derived

```prisma
model JobEvent {
  id, clientId, jobId
  type      String     // job.created, job.scheduled, visit.on_my_way, job.started,
                       // job.completed, cost.added, cost.extra_agreed,
                       // invoice.created, invoice.paid, access.revealed
  summary   String
  payload   Json?
  actor     String?
  createdAt DateTime @default(now())
}
```

This reverses the call made for the customer timeline, and the reason is worth recording: job
history is commercially and legally meaningful — when you arrived, when the customer approved
the extra, when it was signed off. A derived timeline that quietly changes when a record is
edited is worse than no timeline if a job is ever disputed. Customer activity stays derived.

### 2.6 `AccessReveal`

```prisma
model AccessReveal {
  id, clientId, propertyId
  jobId      String?
  actorLabel String        // account holder for now; real user id when staff land
  createdAt  DateTime @default(now())
}
```

Written by the existing reveal endpoint in `routes/customers.ts` and by the arrival briefing.
Also appends a `JobEvent` when `jobId` is present. Logged from day one so the history isn't
starting from zero on the day engineer logins ship.

---

## 3. Migration

`server/prisma/migrations/20260805090000_jobs_pipeline/migration.sql`, hand-written.

### 3.1 Structure

1. `CREATE TYPE` for the four new enums.
2. `CREATE TABLE` for `Job`, `JobCost`, `JobEvent`, `AccessReveal` + indexes.
3. `ALTER TABLE ... ADD COLUMN` for the `Appointment`, `PriceBookItem`, `QuoteLine` and
   `Client` additions. All nullable, no defaults that rewrite rows.

### 3.2 Backfill, and why ids are reused

For every `Enquiry` where `pipeline = 'JOB'`, insert a `Job` **whose `id` is the enquiry's own
cuid**. Different tables, no collision.

This is not sentiment about test data — it's so that:

- `/t/jobs/:id` keeps resolving, including any link already on the owner's phone;
- offline outbox entries already queued against `/jobs/<id>/archive` still apply;
- the persisted React Query cache doesn't have to be invalidated wholesale;
- ~12 route handlers change what they *do* without changing their URL shape.

Status derivation during backfill:

| Source state | operational | commercial |
|---|---|---|
| No quote | `UNSCHEDULED` | `UNQUOTED` |
| Quote DRAFT / SENT | `UNSCHEDULED` | `QUOTED` |
| Quote ACCEPTED, no deposit paid | `UNSCHEDULED` | `QUOTED` |
| Quote ACCEPTED, `depositPaidAt` set | `UNSCHEDULED` | `DEPOSIT_PAID` |
| Invoice exists, unpaid | `COMPLETED` | `INVOICE_SENT` |
| Invoice paid | `COMPLETED` | `PAID` |

Then: link `Appointment.jobId` by matching `enquiryId`; set `Job.archivedAt` where the enquiry
was `pipeline='ARCHIVED'`; copy `customerId` / `propertyId` across.

`Enquiry.pipeline` is left in place and keeps its meaning for the Inbox. Job archiving moves to
`Job.archivedAt`.

### 3.3 Deploy

Railway runs `prisma migrate deploy` via `start:prod`. **Never `migrate dev` against
production.** Verify against a local copy first, then confirm row counts post-deploy.

---

## 4. Job profit — the maths

All figures **exclude VAT**. VAT isn't yours; computing margin on VAT-inclusive totals would
overstate every job. `Quote.vatInclusive` means `subtotalPence` is the number to use.

```
revenue   = quoted job:  Job.quotedTotalPence + Σ billable extras (ex VAT)
            T&M job:     Σ billable JobCost.sellPricePence × qty (ex VAT)

materials = Σ (MATERIAL + SUBCONTRACTOR) unitCostPence × qty
expenses  = Σ EXPENSE unitCostPence × qty
labour    = Σ LABOUR qty(hours) × Client.labourCostPerHourPence   ← null ⇒ 0

profit    = revenue − materials − expenses − labour
margin%   = profit / revenue
```

With `labourCostPerHourPence` unset — the default, and correct for a sole trader who doesn't
invoice himself — profit is literally money in the pocket. Set an hourly cost the day an
engineer joins and the same formula keeps working with no migration.

**Provisional figures.** If any material line has `costPricePence = null`, the UI shows the
profit as provisional with the count of unpriced items and a one-tap way to fix it. It does not
guess, and it does not hide the job.

**Scope limit, stated in the UI.** This is job gross profit — no van, insurance, phone or tax.
The label is "Job profit", never "Profit". Subtracting overheads would make this bookkeeping,
which has to be right or it's dangerous.

The rollup ("boiler swaps 42% · call-outs 71%") is the real prize but is **Phase 2** — the data
lands here, the report comes later.

---

## 5. Server

### 5.1 New files

```
server/src/services/jobs/
  create.ts    createJobFromQuote · createDirectJob · promoteEnquiryToJob
  status.ts    transition table, guards, primaryAction(job)
  costs.ts     cost CRUD, seedCostsFromQuote, computeProfit
  events.ts    appendJobEvent
  invoice.ts   buildDraftInvoiceFromJob
server/src/routes/jobs.ts
```

### 5.2 Route ownership

`routes/jobs.ts` takes over **every** `/jobs*` path and is mounted **before** the tradie router;
the old handlers are deleted from `tradie.ts` in the same commit. Two routers answering the same
prefix is how ordering bugs happen.

Moving across as-is (behaviour preserved, now Job-backed): `GET /jobs`, `GET /jobs/:id`,
`POST /jobs`, `/promote`, `/archive`, `/unarchive`, `DELETE`, `/kill`, `/notes`, `/voice`,
`/messages`.

New:

```
POST   /jobs/from-quote/:quoteId     create job from accepted quote
POST   /jobs/:id/schedule            create/replace the default visit
POST   /jobs/:id/on-my-way
POST   /jobs/:id/start
POST   /jobs/:id/complete            body: completion note, follow-up needed
GET    /jobs/:id/costs               lines + computed profit
POST   /jobs/:id/costs
PATCH  /jobs/:id/costs/:costId
DELETE /jobs/:id/costs/:costId
GET    /jobs/:id/events
POST   /jobs/:id/visits
PATCH  /jobs/:id/visits/:visitId
POST   /jobs/:id/invoice             draft invoice from baseline + billable extras − deposit
GET    /jobs/:id/briefing            arrival briefing, access code masked
```

Every mutation goes through `idempotent(...)`, matching the customer routes, because these are
exactly the writes a tradie makes in a plant room with no signal.

### 5.3 Rules enforced server-side

- Completing a job sets `operational=COMPLETED` and `commercial=READY_TO_INVOICE` — that is what
  populates the To invoice tab, and it is the money-recovery feature.
- The source quote is never mutated. Extras are `JobCost` rows.
- Invoice draft = accepted baseline + billable extras − deposit already paid, deposit shown as
  its own visible deduction line.
- `commercial` advances to `INVOICE_SENT` / `PAID` from the existing invoice send and mark-paid
  handlers.
- Access codes never appear in job payloads except via the deliberate reveal endpoint, which
  writes `AccessReveal`.

---

## 6. Client

### 6.1 Jobs list — `TradieJobsPage.tsx`

Tabs replace New/Quote/Won with pipeline states, using the existing `ListToolbar` (already
horizontally scrollable with counts, per PRD 14.3):

```
All · To schedule · Upcoming · In progress · To invoice · Done · Archive
```

`To invoice` carries a count badge. Cards lead with **work title**, customer secondary (PRD
14.3), with two badges — operational and commercial — never one merged pill. Warning chips
(dog, key safe, call ahead) sit above ordinary metadata. Existing swipe-to-archive and the
`groupByDay` Today/Yesterday grouping are preserved.

### 6.2 Job detail — new `client/src/pages/tradie/job/`

```
JobPage.tsx           shell, header, state-driven primary CTA
tabs/OverviewTab.tsx  next visit, warnings, scope, property, asset, financial summary
tabs/VisitsTab.tsx    hidden until >1 visit or Add visit tapped
tabs/CostsTab.tsx     baseline, materials, labour, expenses, extras, profit
tabs/FilesTab.tsx
tabs/MessagesTab.tsx  the existing message thread, moved off Overview
tabs/ActivityTab.tsx  JobEvent stream
ArrivalBriefing.tsx   access, key safe, dog, parking, asset location
AddCostPage.tsx       fast-add with price-book search
CompleteJobPage.tsx   guided completion + optional signature
InvoiceReviewPage.tsx baseline + extras − deposit = balance
```

The current 558-line `TradieJobPage.tsx` is replaced; its quote-drafting and message sections
move into the new tabs rather than being rewritten from scratch.

**State-driven primary CTA** (PRD 14.2), one dominant action, derived server-side by
`primaryAction(job)` so client and server can't disagree:

| State | CTA |
|---|---|
| Unscheduled | Schedule job |
| Scheduled | On my way |
| On the way | Start job |
| In progress | Complete job |
| Completed, not invoiced | Create invoice |
| Invoice sent / overdue | Record payment |

### 6.3 Costs tab — the no-brainer test

**If the tradie never opens this tab, the profit must still be correct.** A job created from an
accepted quote arrives with its cost lines already seeded from the quote, cost prices pulled
from the rates card. Nothing is typed:

```
Quoted          £2,034
Materials       £1,065
Labour            £160
Expenses            £0
─────────────────────────
Job profit        £809   (40%)      [ Adjust costs ]
```

Adjust is only for when reality differed. Photographing a merchant receipt creates an actual
cost line in one tap.

### 6.4 Rates card

Add "What it costs me" to `rate/RateNewPage.tsx` and `rate/RateCategoryPage.tsx`. Optional,
shown under the sell price, with the resulting margin displayed live. Items without a cost show
a quiet "add cost" affordance rather than a warning — this is opt-in, and half-filled is fine.

### 6.5 Settings

One field: **My cost per hour** — "Leave blank if it's your own time. Set it when someone else
is on the van." Not surfaced in onboarding.

### 6.6 Offline

Everything except file/receipt upload goes through `sendOrQueue`. Starting a job, completing a
job and adding costs are precisely the writes that happen in a cellar. Upload stays the honest
exception — base64 receipts would fill the IndexedDB queue.

---

## 7. Slices

Each slice must typecheck, pass tests and be committed before the next begins (PRD 14.1 §19).

| # | Slice | Verification |
|---|---|---|
| 1 | Schema + migration + backfill | Applied locally; row counts and derived statuses spot-checked |
| 2 | Job service + routes; old handlers removed | `tsc`, server tests, HTTP smoke on every endpoint |
| 3 | Cost price on rates card + settings field | Round-trip a cost price, margin renders |
| 4 | Jobs list with pipeline tabs | Counts correct per tab; swipe + day grouping intact |
| 5 | Job detail shell, Overview, Visits, briefing | CTA correct in each state; access code absent from payload |
| 6 | Costs tab + profit | Quoted job seeds costs with zero input; provisional state when cost unset |
| 7 | Complete flow + invoice from job | Completed job lands in To invoice; deposit deducted visibly |
| 8 | Activity tab + `AccessReveal` audit | Reveal writes a row and a JobEvent |
| 9 | Seed both paths; full verification | Quote-first and direct-booked journeys end to end |

Seed (slice 9) must cover both PRD paths: a boiler replacement quoted → accepted → scheduled →
completed → invoiced → paid, and an emergency leak booked direct → one visit → T&M invoice, plus
one job sitting in **To invoice** so the tab isn't empty on first run.

---

## 8. Risks

- **Route cutover.** The window where both routers could answer `/jobs*` is the one place a
  silent 404 could hide. Old handlers are deleted in the same commit, and every path is
  smoke-tested before the client changes land.
- **Job detail rewrite.** 558 lines are replaced. Quote drafting and messages must be moved,
  not reimplemented, or working behaviour regresses.
- **No visual verification from here.** Layout snags are likely — the seven-pill tab bar and the
  Costs tab are the two to check on a real phone first.
- **A release is required.** Local-bundle Capacitor means none of this reaches the phone without
  `npm run release` in `client/`.

## 9. What actually happened

All nine slices shipped. Where the build differed from this plan:

| Planned | Actual |
|---|---|
| `JobCost.unitCostPence` NOT NULL | Made nullable mid-slice-2 — with a default of 0 there was no way to tell "cost not set" from "genuinely free", and an unpriced boiler read as pure profit |
| Access-reveal audit in slice 8 | Landed in slice 5, which changed the reveal call signature anyway |
| Files tab unassigned to a slice | Built in slice 8 (§6.2 listed it; no slice claimed it) |
| — | `Invoice.jobId` added in slice 7; without it, sending or being paid couldn't move the job's state |

Bugs found by building and running it, not by reading it:

- **Quote-raised-on-site created no Job.** `PATCH /quotes/:id/customer` marked an
  enquiry `pipeline: "JOB"`, which used to be enough to appear in the list. After
  the cutover it needed a real Job or the work silently vanished. (Slice 2.)
- **The quote editor dropped price-book provenance.** Lines saved with
  `priceBookItemId: null`, invisible until costs started flowing through it.
  (Slice 3.)
- **`dayLabel` called tomorrow "Today".** Correct for creation timestamps, wrong
  the moment Upcoming was grouped by visit date. (Slice 4.)
- **Provisional profit still printed 100%.** The flag was set and the banner
  shown, but the headline read as a settled figure. Now presented as a ceiling
  with the percentage withheld. (Slice 6.)
- **The transition guard blocked finishing a call-out.** `Unscheduled →
  Completed` was refused, so a tradie who never tapped "on my way" couldn't mark
  his own job done. (Slice 7.)
- **`nextVisit` showed a completed visit.** A job with a done first fix and a
  booked second fix displayed last week's date as what was coming up. (Slice 9.)

Final state, verified against a freshly seeded database: five jobs, one in each
pipeline tab; the quoted path bills £2,424 less a £500 deposit; the call-out
path bills £100.60 from cost lines with no quote; `accessCode` appears zero
times across all six job endpoints and only via the deliberate reveal.

**Still unverified: none of it has been looked at in a browser.** Layout is the
one thing typechecks and HTTP tests cannot cover.

## 10. Deferred, explicitly

Checklists and tasks · multi-engineer assignment · staff logins, roles and permissions ·
profit-by-job-type report · formal variation approval workflow · overheads and net P&L ·
recurring contracts · route optimisation.
