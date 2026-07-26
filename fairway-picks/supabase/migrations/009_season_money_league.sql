-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 009: League-scoped season money
--
-- WHAT THIS DOES:
--   season_money was a single global table keyed only by player_name — two
--   leagues with a member named "Max" would share one money row, and any
--   founding member could overwrite the founding league's totals from a
--   custom league. This migration:
--     1. Adds league_id (FK → leagues) and backfills every existing row to
--        the founding league (the only league that has ever written here).
--     2. Replaces UNIQUE(player_name) with UNIQUE(league_id, player_name).
--     3. Replaces the global-read / founding-member-write RLS with
--        league-scoped policies (read if member or league is public-view;
--        write only if member of that league).
--
-- DATA SAFETY:
--   * Begins with a full backup snapshot (backup_season_money_009).
--   * The only UPDATE is the additive league_id backfill. No row is deleted;
--     no total is changed. Preflight/postflight scripts snapshot every
--     player's total for comparison.
--   * Transactional and idempotent.
--
-- RUN INSTRUCTIONS:
--   1. Run verification/009_preflight.sql first and save the output.
--   2. Paste this file into the Supabase SQL editor and Run.
--   3. Run verification/009_postflight.sql — totals must match exactly.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 0. Backup snapshot ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_season_money_009 AS SELECT * FROM season_money;

-- ── 1. Add league_id and backfill to the founding league ─────────────────────
ALTER TABLE season_money
  ADD COLUMN IF NOT EXISTS league_id UUID REFERENCES leagues(id) ON DELETE CASCADE;

UPDATE season_money
   SET league_id = '00000000-0000-0000-0000-000000000001'
 WHERE league_id IS NULL;

ALTER TABLE season_money
  ALTER COLUMN league_id SET NOT NULL;

-- ── 2. Uniqueness: per league, not global ────────────────────────────────────
ALTER TABLE season_money
  DROP CONSTRAINT IF EXISTS season_money_player_name_key;

-- Named index so the app can upsert with onConflict: 'league_id,player_name'.
CREATE UNIQUE INDEX IF NOT EXISTS season_money_league_player_key
  ON season_money(league_id, player_name);

-- ── 3. League-scoped RLS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "season_money_select_public"         ON season_money;
DROP POLICY IF EXISTS "season_money_write_founding_member" ON season_money;
DROP POLICY IF EXISTS "season_money_select_member_or_public" ON season_money;
DROP POLICY IF EXISTS "season_money_write_member"            ON season_money;

CREATE POLICY "season_money_select_member_or_public" ON season_money
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = season_money.league_id
         AND l.is_public_view = true
    )
    OR public.is_league_member(league_id, auth.uid())
  );

CREATE POLICY "season_money_write_member" ON season_money
  FOR ALL
  USING (
    auth.uid() IS NOT NULL
    AND public.is_league_member(league_id, auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_league_member(league_id, auth.uid())
  );

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- DONE. Run verification/009_postflight.sql — every player total must match
-- the preflight snapshot exactly.
-- ─────────────────────────────────────────────────────────────────────────────
