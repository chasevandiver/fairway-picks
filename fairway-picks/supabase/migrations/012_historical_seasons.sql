-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 012: Historical seasons
--
-- WHY:
--   Seasons 2020–2025 were kept in Google Sheets. Their aggregate finishes,
--   podiums, majors, tour winners and cuts are already baked into the hardcoded
--   ALL_STATS / MAJORS_HISTORY baselines in src/lib/constants.ts — but the
--   money is not recorded anywhere in the app, so there is no season-by-season
--   money view.
--
--   Importing those seasons as ordinary tournaments would double-count every
--   finish and cut, because the baseline already counts them.
--
-- WHAT THIS DOES:
--   Adds `is_historical` to tournaments. A historical tournament is a real row
--   in every respect — it appears in History and in money totals — but the
--   all-time counting stats deliberately skip it, because the hardcoded
--   baseline already includes those events.
--
--   Money has no baseline to conflict with (ALL_STATS records finishes and
--   cuts, never dollars), so imported money is added with no risk of doubling.
--
--   When every pre-app season has been imported in full, the baseline can be
--   retired and this flag stops mattering — nothing here blocks that.
--
-- RUN THIS in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run more than once (IF NOT EXISTS guard). No data is modified.
-- Rollback: supabase/rollback/012_rollback.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS is_historical BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tournaments.is_historical IS
  'Imported from a pre-app season. Counts toward money and appears in History, '
  'but is skipped by all-time finish/cut/major tallies because the hardcoded '
  'ALL_STATS baseline already includes those events.';

-- Historical rows are read on every league-data call alongside live ones; the
-- partial index keeps the flag cheap to filter on without touching the common
-- non-historical path.
CREATE INDEX IF NOT EXISTS tournaments_historical_idx
  ON tournaments (league_id, date)
  WHERE is_historical;

-- No RLS change: historical tournaments are ordinary tournaments and are
-- already covered by the membership-scoped policies from 006.
