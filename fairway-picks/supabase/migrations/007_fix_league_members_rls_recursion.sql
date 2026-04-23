-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 007: Fix infinite recursion in league_members RLS
--
-- WHAT THIS DOES:
--   Migration 006 added `league_members_select_self_leagues`, which contained
--   a self-referencing EXISTS subquery on `league_members`. Postgres evaluates
--   the SELECT policy whenever the table is queried (including the implicit
--   SELECT that supabase-js does after an INSERT/UPSERT), causing:
--
--     ERROR: infinite recursion detected in policy for relation "league_members"
--
--   This migration replaces the bad policy with one that uses a
--   SECURITY DEFINER helper function. The function runs with the owner's
--   privileges and therefore bypasses RLS, so the internal lookup doesn't
--   re-trigger the policy.
--
-- DATA SAFETY:
--   * RLS-only change, no row is modified, moved, or deleted.
--   * Transactional — all-or-nothing.
--   * Idempotent — safe to re-run.
--
-- RUN INSTRUCTIONS:
--   Paste this entire file into the Supabase SQL editor and Run.
--   Then run the verification query at the bottom.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Drop the broken policy ───────────────────────────────────────────────
DROP POLICY IF EXISTS "league_members_select_self_leagues" ON league_members;

-- ── 2. Helper function that bypasses RLS ────────────────────────────────────
-- SECURITY DEFINER runs the body as the function owner (postgres superuser),
-- so its internal query against league_members is not subject to RLS and
-- cannot recurse. STABLE lets the planner cache the result within a query.
-- Marked as search_path-safe via the SET to prevent a schema hijack attack.
CREATE OR REPLACE FUNCTION public.is_league_member(
  p_league_id uuid,
  p_user_id   uuid
) RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.league_members
     WHERE league_id = p_league_id
       AND user_id   = p_user_id
  );
$$;

-- Grant execute to the roles that run RLS checks.
GRANT EXECUTE ON FUNCTION public.is_league_member(uuid, uuid) TO anon, authenticated;

-- ── 3. New recursion-free SELECT policy ─────────────────────────────────────
-- A user can see a league_members row if:
--   (a) it's their own row (user_id = auth.uid()), OR
--   (b) they're a member of the same league — checked via the helper.
CREATE POLICY "league_members_select_self_or_peers" ON league_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_league_member(league_id, auth.uid())
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — run this after the migration above to confirm it applied.
-- Row counts must still match the baseline; the broken policy is gone;
-- the new policy + function exist.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'league_members_select_self_leagues dropped' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'league_members'
       AND policyname = 'league_members_select_self_leagues'
  ) AS passed
UNION ALL
SELECT
  'league_members_select_self_or_peers exists',
  EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'league_members'
       AND policyname = 'league_members_select_self_or_peers'
  )
UNION ALL
SELECT
  'is_league_member() function exists',
  EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'is_league_member'
  )
UNION ALL
SELECT
  'founding row count still 3',
  (SELECT COUNT(*) FROM league_members
    WHERE league_id = '00000000-0000-0000-0000-000000000001') = 3;
