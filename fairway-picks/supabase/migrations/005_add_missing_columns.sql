-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 005: Add missing columns
--
-- WHAT THIS DOES:
--   1. Adds `is_major` (BOOLEAN) to tournaments — used by the league-data API
--      when joining results to tournament rows. Without this column, PostgREST
--      returns a 400 error and the API silently returns empty results/history.
--
--   2. Adds `golfers_cut` (INTEGER) to results — tracks how many of a player's
--      golfers were cut in a tournament. Written during finalize, read in stats.
--
--   3. Back-fills any tournaments that have a NULL league_id so they are
--      associated with the founding league and appear in the History tab.
--
-- RUN THIS in: Supabase Dashboard → SQL Editor → New Query → Run
-- It is safe to run multiple times (IF NOT EXISTS / ON CONFLICT guards).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add is_major to tournaments (safe if already exists)
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS is_major BOOLEAN NOT NULL DEFAULT false;

-- 2. Add golfers_cut to results (safe if already exists)
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS golfers_cut INTEGER NOT NULL DEFAULT 0;

-- 3. Associate any un-linked tournaments with the founding league
--    (covers tournaments created before the league_id column existed)
UPDATE tournaments
  SET league_id = '00000000-0000-0000-0000-000000000001'
  WHERE league_id IS NULL;
