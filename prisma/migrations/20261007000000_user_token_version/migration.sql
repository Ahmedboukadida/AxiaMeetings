-- N41 session revocation: every session JWT carries users.token_version as `tv`.
-- Bumping the column (password reset/change, role or company change) revokes older tokens.
-- Existing tokens have no `tv` claim and count as version 0, so nobody is logged out by this migration.
-- Hand-written (no Prisma engines in the build sandbox); IF NOT EXISTS keeps it idempotent.

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;
