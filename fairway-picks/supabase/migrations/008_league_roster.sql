-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 008: Per-league roster
--
-- WHAT THIS DOES:
--   Introduces league_roster — the per-league list of player names that get
--   used in picks / results / season_money / golfer_results. Each entry is
--   either:
--     * Auto-linked to an authenticated member (user_id set, player_name =
--       their display_name at join time), or
--     * A commissioner-added placeholder (user_id NULL, just a name).
--
--   Backfills:
--     * Founding league (EAGLE1): the 6 legacy names Eric/Max/Hayden/Andrew/
--       Brennan/Chase, each linked to its aliased user_id where one exists.
--       Entries without an alias get user_id = NULL and stay as placeholders
--       until the corresponding person signs up.
--     * Every existing custom-league member: a roster entry using the
--       member's profile.display_name.
--
-- DATA SAFETY:
--   * Additive only. No existing row is modified, moved, or deleted.
--   * Transactional. Transactional — all-or-nothing.
--   * Idempotent. Re-running this file produces the same end state.
--   * Founding league row counts are unchanged.
--
-- RUN INSTRUCTIONS:
--   1. Paste this file into Supabase Dashboard → SQL Editor → Run.
--   2. Then run the verification query at the bottom and paste the result
--      back so we can confirm the backfill landed correctly.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Schema ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_roster (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   UUID NOT NULL REFERENCES leagues(id)  ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  added_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (league_id, player_name)
);

-- A given user_id can have at most one roster entry per league.
-- Partial index because NULL (placeholders) can repeat.
CREATE UNIQUE INDEX IF NOT EXISTS league_roster_league_user_unique
  ON league_roster (league_id, user_id)
  WHERE user_id IS NOT NULL;

-- Lookup-by-league is hot on every page load.
CREATE INDEX IF NOT EXISTS league_roster_league_idx
  ON league_roster (league_id);

ALTER TABLE league_roster ENABLE ROW LEVEL SECURITY;

-- ── 2. RLS policies ─────────────────────────────────────────────────────────
-- Drop any prior versions to keep the migration idempotent.
DROP POLICY IF EXISTS "league_roster_select_member_or_public" ON league_roster;
DROP POLICY IF EXISTS "league_roster_insert_self_or_commissioner" ON league_roster;
DROP POLICY IF EXISTS "league_roster_update_commissioner" ON league_roster;
DROP POLICY IF EXISTS "league_roster_delete_commissioner" ON league_roster;

-- SELECT: a roster entry is visible if the viewer is a member of the league
-- OR the league is publicly viewable (founding league's /view/EAGLE1).
CREATE POLICY "league_roster_select_member_or_public" ON league_roster
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = league_roster.league_id
         AND l.is_public_view = true
    )
    OR public.is_league_member(league_roster.league_id, auth.uid())
  );

-- INSERT: allowed when
--   (a) user is adding themselves (self-onboard on join), OR
--   (b) user is the commissioner of the league (add placeholders + invitees).
CREATE POLICY "league_roster_insert_self_or_commissioner" ON league_roster
  FOR INSERT WITH CHECK (
    (user_id IS NOT NULL AND user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = league_roster.league_id
         AND l.commissioner_id = auth.uid()
    )
  );

-- UPDATE: commissioner only (rename, re-link placeholder to a real user_id).
CREATE POLICY "league_roster_update_commissioner" ON league_roster
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = league_roster.league_id
         AND l.commissioner_id = auth.uid()
    )
  );

-- DELETE: commissioner only. App enforces "no picks/results reference this
-- roster entry" before calling DELETE so historical data stays intact.
CREATE POLICY "league_roster_delete_commissioner" ON league_roster
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = league_roster.league_id
         AND l.commissioner_id = auth.uid()
    )
  );

-- ── 3. Backfill: Founding league (EAGLE1) ───────────────────────────────────
-- The 6 legacy names each get a roster row. user_id comes from player_aliases
-- where the legacy name has already been claimed by a signed-up member;
-- otherwise NULL (placeholder that gets linked when they sign up).
INSERT INTO league_roster (league_id, player_name, user_id)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Eric',
     (SELECT user_id FROM player_aliases WHERE player_name = 'Eric'    LIMIT 1)),
  ('00000000-0000-0000-0000-000000000001', 'Max',
     (SELECT user_id FROM player_aliases WHERE player_name = 'Max'     LIMIT 1)),
  ('00000000-0000-0000-0000-000000000001', 'Hayden',
     (SELECT user_id FROM player_aliases WHERE player_name = 'Hayden'  LIMIT 1)),
  ('00000000-0000-0000-0000-000000000001', 'Andrew',
     (SELECT user_id FROM player_aliases WHERE player_name = 'Andrew'  LIMIT 1)),
  ('00000000-0000-0000-0000-000000000001', 'Brennan',
     (SELECT user_id FROM player_aliases WHERE player_name = 'Brennan' LIMIT 1)),
  ('00000000-0000-0000-0000-000000000001', 'Chase',
     (SELECT user_id FROM player_aliases WHERE player_name = 'Chase'   LIMIT 1))
ON CONFLICT (league_id, player_name) DO NOTHING;

-- ── 4. Backfill: existing custom-league members ─────────────────────────────
-- For every member of a non-founding league, create a roster entry with their
-- profile.display_name. If two members of the same league happen to share a
-- display_name, the UNIQUE(league_id, player_name) blocks the second insert
-- and we log a warning via the verification query below.
INSERT INTO league_roster (league_id, player_name, user_id)
SELECT lm.league_id, p.display_name, lm.user_id
  FROM league_members lm
  JOIN profiles p ON p.id = lm.user_id
 WHERE lm.league_id <> '00000000-0000-0000-0000-000000000001'
ON CONFLICT (league_id, player_name) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — paste the result of this back to me.
-- Expected for a healthy migration:
--   * founding roster size = 6
--   * founding roster aliased = number of player_aliases rows (<= 6)
--   * founding row counts (leagues/tournaments/picks/etc.) unchanged from
--     the baseline we captured before migration 006
--   * custom-league backfill: every (league_id, user_id) in league_members
--     appears in league_roster, except where display_name collided.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'founding roster size (expect 6)' AS scope,
  (SELECT COUNT(*) FROM league_roster
     WHERE league_id = '00000000-0000-0000-0000-000000000001') AS value
UNION ALL
SELECT
  'founding roster aliased (linked to a user_id)',
  (SELECT COUNT(*) FROM league_roster
     WHERE league_id = '00000000-0000-0000-0000-000000000001'
       AND user_id IS NOT NULL)
UNION ALL
SELECT
  'founding roster placeholders (user_id NULL)',
  (SELECT COUNT(*) FROM league_roster
     WHERE league_id = '00000000-0000-0000-0000-000000000001'
       AND user_id IS NULL)
UNION ALL
SELECT
  'custom-league members total',
  (SELECT COUNT(*) FROM league_members
     WHERE league_id <> '00000000-0000-0000-0000-000000000001')
UNION ALL
SELECT
  'custom-league roster entries backfilled',
  (SELECT COUNT(*) FROM league_roster
     WHERE league_id <> '00000000-0000-0000-0000-000000000001'
       AND user_id IS NOT NULL)
UNION ALL
SELECT
  'custom-league members missing from roster (display_name collision)',
  (SELECT COUNT(*)
     FROM league_members lm
     WHERE lm.league_id <> '00000000-0000-0000-0000-000000000001'
       AND NOT EXISTS (
         SELECT 1 FROM league_roster lr
          WHERE lr.league_id = lm.league_id
            AND lr.user_id   = lm.user_id
       ))
UNION ALL
SELECT
  'founding row counts still intact (tournaments)',
  (SELECT COUNT(*) FROM tournaments
     WHERE league_id = '00000000-0000-0000-0000-000000000001')
UNION ALL
SELECT
  'founding row counts still intact (picks)',
  (SELECT COUNT(*) FROM picks p
     JOIN tournaments t ON t.id = p.tournament_id
    WHERE t.league_id = '00000000-0000-0000-0000-000000000001')
UNION ALL
SELECT
  'founding row counts still intact (results)',
  (SELECT COUNT(*) FROM results r
     JOIN tournaments t ON t.id = r.tournament_id
    WHERE t.league_id = '00000000-0000-0000-0000-000000000001')
ORDER BY scope;
