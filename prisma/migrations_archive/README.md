# Archived migrations

These four migrations were created before the databases were managed with `prisma db push`,
so they no longer match `prisma/schema.prisma`. They are kept for reference only and are not applied.

The live schema is captured by the baseline migration `prisma/migrations/0_init`
(generated with `npm run migrate:diff:baseline`) and marked as applied on existing databases with
`npx prisma migrate resolve --applied 0_init`. See the Phase D runbook.
