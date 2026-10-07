-- ─────────────────────────────────────────────────────────────────────────────
-- AxiaMeetings - least-privilege database role for the app (N23 / N51)
--
-- Today the app connects as the database owner / superuser. This script creates
-- `axia_app`, a role that can only read and write rows (no DDL, no DROP, no
-- access to other databases' objects). Prisma migrations keep running as the
-- owner through a separate MIGRATE_DATABASE_URL.
--
-- Run ONCE (re-running is safe: it only resets the password and re-grants),
-- as postgres on the Windows host, from the repository root (PowerShell):
--
--   psql -U postgres -d axiameetingforall -v app_password="<STRONG-PASSWORD>" -f docs/db-least-privilege.sql
--
--   (psql.exe lives in e.g. "C:\Program Files\PostgreSQL\<version>\bin".
--    Generate a password with letters/digits only so it needs no URL-encoding:
--    -join ((1..40) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) }) )
--
-- Then switch the Docker stack (.env.docker):
--
--   1. Keep the current owner URL for migrations, under a new name:
--        MIGRATE_DATABASE_URL=postgresql://postgres:OWNER_PASSWORD@host.docker.internal:5432/axiameetingforall?schema=public
--   2. Point the app at the new role:
--        DATABASE_URL=postgresql://axia_app:<STRONG-PASSWORD>@host.docker.internal:5432/axiameetingforall?schema=public
--   3. Remove DIRECT_URL from .env.docker if present (the migrate service sets it
--      from MIGRATE_DATABASE_URL; the app does not use it).
--   4. docker compose --env-file .env.docker up -d --build
--      The migrate service uses MIGRATE_DATABASE_URL (falls back to DATABASE_URL when
--      unset); the app container never receives MIGRATE_DATABASE_URL.
--   5. Check: docker compose logs migrate app  (no "permission denied for table ...").
--
-- `npm run seed` and `prisma migrate` run from the host must also use the owner URL.
--
-- Rollback: put the owner URL back in DATABASE_URL and remove MIGRATE_DATABASE_URL.
--
-- If migrations are applied by a role other than `postgres`, replace `postgres`
-- in the two ALTER DEFAULT PRIVILEGES statements below with that role.
-- ─────────────────────────────────────────────────────────────────────────────

\set ON_ERROR_STOP on

\if :{?app_password}
\else
  \echo 'Missing password: run with  -v app_password="<STRONG-PASSWORD>"'
  \quit
\endif

-- 1. Role (created if missing, password (re)set otherwise)
SELECT format('CREATE ROLE axia_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axia_app')
\gexec
SELECT format('ALTER ROLE axia_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'app_password')
\gexec

-- 2. Connect to this database and use (not create in) schema public
GRANT CONNECT ON DATABASE axiameetingforall TO axia_app;
GRANT USAGE ON SCHEMA public TO axia_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM axia_app;

-- 3. Row access on existing tables and sequences
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO axia_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO axia_app;

-- The app never touches Prisma's migration history.
DO $$
BEGIN
    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
        REVOKE ALL ON public._prisma_migrations FROM axia_app;
    END IF;
END $$;

-- 4. Same rights on tables/sequences created later by migrations (run as postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO axia_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO axia_app;

-- 5. Summary
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE grantee = 'axia_app' AND table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
