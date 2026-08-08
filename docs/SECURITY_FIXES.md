# Security fixes (2026-08-08)

Remediations for Critical/High findings from the focused security audit.

| ID | Fix |
|----|-----|
| C1 | Stripe webhook rejects requests when `STRIPE_WEBHOOK_SECRET` is unset; always verifies signature |
| C2 | `POST /api/followups/tick` requires `x-cron-secret` (timing-safe); uses `CRON_SECRET` or `MAGIC_LINK_SECRET` |
| C3 | Upload rate limit; magic-byte checks; 128-bit random filenames; private-first signed URLs (see below) |
| H1 | Seed login disabled in production |
| H2 | Template duplicate idempotency returns only own templates (409 on foreign id clash) |
| H3 | Nested FK ownership checks (contacts, customers, properties, enquiries, jobs, receipt files); property includes filtered by `clientId` |
| H4 | Production boot fails on weak `MAGIC_LINK_SECRET` / missing operator auth / Stripe key without webhook secret; `OPERATOR_SESSION_SECRET` added |
| H5 | Operator login rate-limited (20 / 15 min) |
| H6 | Inbound email secret compared timing-safe |
| M3 | Public `/api/health` trimmed; diagnostics moved to `/api/health/detail` (operator auth) |

## Private-first signed uploads

- Private objects (`private/certs`, `private/audio`, `private/pdfs`, plus legacy `certs/` and `pdfs/`) are not served by `express.static`.
- Access via `GET /api/files/<key>?exp=&sig=` (HMAC, default 15 min; 1 h on public token pages).
- DB still stores permanent `/uploads/...` paths; APIs and public HTML mint signed URLs with `toAccessUrl()`.
- Intake photos and logos remain publicly readable under `/uploads/<file>` (intentional).
- Optional `FILE_SIGNING_SECRET` (falls back to `MAGIC_LINK_SECRET`).

**Ops notes before deploying to production:** ensure `MAGIC_LINK_SECRET` (at least 32 chars), `OPERATOR_ADMIN_PASSWORD` or `OPERATOR_API_TOKEN`, and `STRIPE_WEBHOOK_SECRET` (if Stripe is configured) are set — the API will refuse to start otherwise. Wipe seed clients (`npm run db:seed:wipe`) if any remain in prod DBs.
