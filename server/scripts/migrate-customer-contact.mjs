/**
 * One-off: mark CustomerContact migration applied after out-of-band create.
 * Prefer: npx prisma migrate resolve --applied 20260725150000_customer_contact
 *
 * Do not re-run schema DDL against prod — Prisma migrations own the schema.
 */
console.error(
  "Deprecated. Use: npx prisma migrate resolve --applied 20260725150000_customer_contact"
);
process.exit(1);
