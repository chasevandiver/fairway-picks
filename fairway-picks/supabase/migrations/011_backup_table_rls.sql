-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 011: Lock down backup tables
--
-- The backup snapshots created by 008–010 live in the public schema, which
-- PostgREST exposes — without RLS they were readable via the anon key
-- (backup_profiles_008 holds emails; backup_leagues_008 holds invite codes).
-- Enabling RLS with no policies denies all API access; the service role and
-- the SQL editor (for restores) still bypass RLS.
--
-- Transactional, idempotent. Applies to any backup_* table present.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'backup\_%' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;

COMMIT;

-- Verification: expect zero rows.
SELECT tablename
FROM pg_tables pt
WHERE schemaname = 'public' AND tablename LIKE 'backup\_%' ESCAPE '\'
  AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = pt.tablename AND c.relrowsecurity
  );
