# TradersMate seed data

Marked test data for every CRM + tradie screen. Safe to wipe at launch.

## Commands

```bash
# Insert (wipes previous seed first, then re-seeds)
npm run db:seed

# Delete ALL seed rows only (keeps real customers)
npm run db:seed:wipe
```

## How seed rows are identified

| Field | Marker |
|---|---|
| Business / lead names | start with `[SEED]` |
| `Lead.placeId` | `SEED_TM_…` |
| `Client.routeKey` | `seed_tm_…` |
| Quote / invoice `publicToken` | `seedtok_…` |
| Inbound email local | `seed-…` |
| Search occupation / town | starts with `SEED` |
| Seed phones | `07000001xxx` / `07000002xxx` / `07000003xxx` |

Source of truth: `markers.ts`

## Quick login (demo plumbing)

| | |
|---|---|
| Route key | `seed_tm_demo_plumbing` |
| Phone | `07000001001` |
| Session | `localStorage.setItem("tm_tradie_session", "seed_session_demo_plumbing_v1")` |

Public pages:

- Quote: `/q/seedtok_quote_sent_bob`
- Invoice: `/i/seedtok_inv_sent_dan`

## Before launch

Run `npm run db:seed:wipe` against production. Confirm no `[SEED]` clients/leads remain.
