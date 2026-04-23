-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 006: Custom league isolation
--
-- WHAT THIS DOES:
--   1. Adds `is_public_view` to `leagues`. When TRUE, non-members can read the
--      league's tournaments/picks/results (the EAGLE1 /view/EAGLE1 use case).
--      When FALSE (default for new custom leagues), only members can read.
--
--   2. Grandfathers "The Original League" (EAGLE1) as is_public_view = true so
--      existing shareable view links keep working and no history is hidden.
--
--   3. Replaces the permissive public-read / anon-write RLS policies on
--      `tournaments`, `picks`, `results`, `golfer_results`, `season_money`,
--      and `league_members` with membership-scoped policies. This is the
--      database-level enforcement that prevents a custom league from ever
--      querying or touching another league's data.
--
-- DATA SAFETY:
--   * This migration is ADDITIVE and RLS-only. No existing row is modified,
--     moved, or deleted.
--   * All queries that reach this database through the service_role key
--     (server API routes) continue to work — service_role bypasses RLS.
--   * The migration runs inside a single transaction — any failure mid-way
--     rolls back everything.
--   * It is idempotent: re-running the file has the same end state.
--
-- RUN INSTRUCTIONS:
--   1. First, run verification/006_preflight.sql and save the output.
--   2. Open Supabase Dashboard → SQL Editor → New Query.
--   3. Paste this entire file, click Run.
--   4. Then run verification/006_postflight.sql and confirm every row count
--      matches the pre-flight numbers exactly.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Schema: is_public_view on leagues ─────────────────────────────────────
ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS is_public_view BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Grandfather the founding league ───────────────────────────────────────
-- EAGLE1 keeps its public viewability so /view/EAGLE1 bookmarks stay working.
UPDATE leagues
   SET is_public_view = true
 WHERE id = '00000000-0000-0000-0000-000000000001';

-- ── 3. Drop the permissive legacy policies ───────────────────────────────────
-- These are being replaced with membership-scoped equivalents below.
DROP POLICY IF EXISTS "public_read_tournaments"  ON tournaments;
DROP POLICY IF EXISTS "anon_write_tournaments"   ON tournaments;
DROP POLICY IF EXISTS "public_read_picks"        ON picks;
DROP POLICY IF EXISTS "anon_write_picks"         ON picks;
DROP POLICY IF EXISTS "public_read_results"      ON results;
DROP POLICY IF EXISTS "anon_write_results"       ON results;
DROP POLICY IF EXISTS "public_read_season"       ON season_money;
DROP POLICY IF EXISTS "anon_write_season"        ON season_money;
DROP POLICY IF EXISTS "golfer_results are publicly readable" ON golfer_results;
DROP POLICY IF EXISTS "golfer_results anon insert"           ON golfer_results;
DROP POLICY IF EXISTS "golfer_results anon update"           ON golfer_results;
DROP POLICY IF EXISTS "golfer_results anon delete"           ON golfer_results;
DROP POLICY IF EXISTS "League members are publicly readable" ON league_members;

-- Also drop any re-runs of the new policies so this file is idempotent:
DROP POLICY IF EXISTS "tournaments_select_member_or_public" ON tournaments;
DROP POLICY IF EXISTS "tournaments_insert_member"           ON tournaments;
DROP POLICY IF EXISTS "tournaments_update_member"           ON tournaments;
DROP POLICY IF EXISTS "tournaments_delete_member"           ON tournaments;
DROP POLICY IF EXISTS "picks_select_member_or_public"       ON picks;
DROP POLICY IF EXISTS "picks_insert_member"                 ON picks;
DROP POLICY IF EXISTS "picks_update_member"                 ON picks;
DROP POLICY IF EXISTS "picks_delete_member"                 ON picks;
DROP POLICY IF EXISTS "results_select_member_or_public"     ON results;
DROP POLICY IF EXISTS "results_insert_member"               ON results;
DROP POLICY IF EXISTS "results_update_member"               ON results;
DROP POLICY IF EXISTS "results_delete_member"               ON results;
DROP POLICY IF EXISTS "golfer_results_select_member_or_public" ON golfer_results;
DROP POLICY IF EXISTS "golfer_results_insert_member"        ON golfer_results;
DROP POLICY IF EXISTS "golfer_results_update_member"        ON golfer_results;
DROP POLICY IF EXISTS "golfer_results_delete_member"        ON golfer_results;
DROP POLICY IF EXISTS "season_money_select_public"          ON season_money;
DROP POLICY IF EXISTS "season_money_write_founding_member"  ON season_money;
DROP POLICY IF EXISTS "league_members_select_self_leagues"  ON league_members;

-- ── 4. tournaments: read if member or league is public_view ──────────────────
CREATE POLICY "tournaments_select_member_or_public" ON tournaments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = tournaments.league_id
         AND l.is_public_view = true
    )
    OR EXISTS (
      SELECT 1 FROM league_members m
       WHERE m.league_id = tournaments.league_id
         AND m.user_id  = auth.uid()
    )
  );

-- Write: only authenticated members of that league.
CREATE POLICY "tournaments_insert_member" ON tournaments
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM league_members m
       WHERE m.league_id = tournaments.league_id
         AND m.user_id  = auth.uid()
    )
  );

CREATE POLICY "tournaments_update_member" ON tournaments
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM league_members m
       WHERE m.league_id = tournaments.league_id
         AND m.user_id  = auth.uid()
    )
  );

CREATE POLICY "tournaments_delete_member" ON tournaments
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM league_members m
       WHERE m.league_id = tournaments.league_id
         AND m.user_id  = auth.uid()
    )
  );

-- ── 5. picks: scoped by the parent tournament's league ───────────────────────
CREATE POLICY "picks_select_member_or_public" ON picks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN leagues     l ON l.id = t.league_id
       WHERE t.id = picks.tournament_id
         AND (
           l.is_public_view = true
           OR EXISTS (
             SELECT 1 FROM league_members m
              WHERE m.league_id = t.league_id
                AND m.user_id  = auth.uid()
           )
         )
    )
  );

CREATE POLICY "picks_insert_member" ON picks
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = picks.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

CREATE POLICY "picks_update_member" ON picks
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = picks.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

CREATE POLICY "picks_delete_member" ON picks
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = picks.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

-- ── 6. results: same pattern as picks ────────────────────────────────────────
CREATE POLICY "results_select_member_or_public" ON results
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN leagues     l ON l.id = t.league_id
       WHERE t.id = results.tournament_id
         AND (
           l.is_public_view = true
           OR EXISTS (
             SELECT 1 FROM league_members m
              WHERE m.league_id = t.league_id
                AND m.user_id  = auth.uid()
           )
         )
    )
  );

CREATE POLICY "results_insert_member" ON results
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = results.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

CREATE POLICY "results_update_member" ON results
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = results.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

CREATE POLICY "results_delete_member" ON results
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = results.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

-- ── 7. golfer_results: same pattern as picks ─────────────────────────────────
CREATE POLICY "golfer_results_select_member_or_public" ON golfer_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN leagues     l ON l.id = t.league_id
       WHERE t.id = golfer_results.tournament_id
         AND (
           l.is_public_view = true
           OR EXISTS (
             SELECT 1 FROM league_members m
              WHERE m.league_id = t.league_id
                AND m.user_id  = auth.uid()
           )
         )
    )
  );

CREATE POLICY "golfer_results_insert_member" ON golfer_results
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = golfer_results.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

CREATE POLICY "golfer_results_update_member" ON golfer_results
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = golfer_results.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

CREATE POLICY "golfer_results_delete_member" ON golfer_results
  FOR DELETE USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM tournaments t
        JOIN league_members m ON m.league_id = t.league_id
       WHERE t.id       = golfer_results.tournament_id
         AND m.user_id  = auth.uid()
    )
  );

-- ── 8. season_money: legacy table, founding-league-only data ─────────────────
-- Keep public SELECT (the founding league is public_view) but restrict writes
-- to authenticated members of the founding league.
CREATE POLICY "season_money_select_public" ON season_money
  FOR SELECT USING (true);

CREATE POLICY "season_money_write_founding_member" ON season_money
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM league_members m
       WHERE m.league_id = '00000000-0000-0000-0000-000000000001'
         AND m.user_id  = auth.uid()
    )
  );

-- ── 9. league_members: only see memberships in leagues you belong to ─────────
-- Prevents a stranger from enumerating who is in a private league.
-- (The /view/EAGLE1 page reads membership via the service-role API route.)
CREATE POLICY "league_members_select_self_leagues" ON league_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM league_members m2
       WHERE m2.league_id = league_members.league_id
         AND m2.user_id  = auth.uid()
    )
  );

-- ── 10. Index support for the new RLS subqueries ─────────────────────────────
-- league_members(league_id, user_id) already unique (migration 003).
-- tournaments(league_id) benefits from an explicit index for RLS joins.
CREATE INDEX IF NOT EXISTS tournaments_league_id_idx ON tournaments(league_id);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- DONE. Now run verification/006_postflight.sql and confirm all row counts
-- match the pre-flight baseline exactly.
-- ─────────────────────────────────────────────────────────────────────────────
