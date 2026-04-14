-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: Fix league data associations
--
-- WHAT THIS DOES:
--   Ensures all tournament data (picks, results, golfer_results) is correctly
--   associated with the founding league (00000000-0000-0000-0000-000000000001).
--
--   Run this in your Supabase SQL Editor if the Golfer Log or History tabs
--   aren't showing data in the main league view.
--
-- AFTER RUNNING:
--   If the Golfer Log is still empty for old tournaments, those tournaments were
--   finalized before the golfer_results table existed. You'll need to re-finalize
--   them via the Admin tab → "Finalize & Record Results" while the live scores
--   are still available, OR manually insert golfer_results rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Reassociate ALL tournaments to the founding league.
-- This covers tournaments that were either NULL or accidentally set to a
-- different league_id when multi-league support was added.
UPDATE tournaments
  SET league_id = '00000000-0000-0000-0000-000000000001'
  WHERE league_id IS NULL
     OR league_id != '00000000-0000-0000-0000-000000000001';

-- Step 2: Remove any stray league_members rows that point to non-founding leagues
-- (orphan leagues created accidentally during multi-league setup).
-- IMPORTANT: Only run this if your group uses a single league.
-- Comment this block out if you intentionally have multiple leagues.
DELETE FROM league_members
  WHERE league_id != '00000000-0000-0000-0000-000000000001';

-- Step 3: Ensure every profile has a membership in the founding league.
-- (Safe to run even if memberships already exist — ON CONFLICT DO NOTHING.)
INSERT INTO league_members (league_id, user_id)
  SELECT '00000000-0000-0000-0000-000000000001', id
  FROM profiles
  WHERE id NOT IN (
    SELECT user_id FROM league_members
    WHERE league_id = '00000000-0000-0000-0000-000000000001'
  )
  ON CONFLICT DO NOTHING;

-- Step 4: Clean up orphan leagues (leagues with no members or tournaments).
-- Comment this out if you want to keep them.
DELETE FROM leagues
  WHERE id != '00000000-0000-0000-0000-000000000001'
    AND id NOT IN (SELECT DISTINCT league_id FROM league_members WHERE league_id IS NOT NULL)
    AND id NOT IN (SELECT DISTINCT league_id FROM tournaments WHERE league_id IS NOT NULL);
