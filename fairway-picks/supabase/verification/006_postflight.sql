-- ─────────────────────────────────────────────────────────────────────────────
-- POST-FLIGHT: Verify migration 006 preserved every row in the original league.
-- Run this AFTER migration 006. The row_count for every table_scope MUST
-- equal the pre-flight numbers exactly. If ANY count differs, STOP and roll
-- back using rollback/006_rollback.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Row counts (must match pre-flight) ───────────────────────────────────────
WITH founding AS (
  SELECT '00000000-0000-0000-0000-000000000001'::uuid AS id
)
SELECT
  'leagues (founding)'                    AS table_scope,
  (SELECT COUNT(*) FROM leagues           WHERE id = (SELECT id FROM founding))         AS row_count
UNION ALL
SELECT
  'league_members (founding)',
  (SELECT COUNT(*) FROM league_members    WHERE league_id = (SELECT id FROM founding))
UNION ALL
SELECT
  'tournaments (founding)',
  (SELECT COUNT(*) FROM tournaments       WHERE league_id = (SELECT id FROM founding))
UNION ALL
SELECT
  'picks (founding tournaments)',
  (SELECT COUNT(*) FROM picks p
     JOIN tournaments t ON t.id = p.tournament_id
    WHERE t.league_id = (SELECT id FROM founding))
UNION ALL
SELECT
  'results (founding tournaments)',
  (SELECT COUNT(*) FROM results r
     JOIN tournaments t ON t.id = r.tournament_id
    WHERE t.league_id = (SELECT id FROM founding))
UNION ALL
SELECT
  'golfer_results (founding tournaments)',
  (SELECT COUNT(*) FROM golfer_results g
     JOIN tournaments t ON t.id = g.tournament_id
    WHERE t.league_id = (SELECT id FROM founding))
UNION ALL
SELECT
  'season_money (all rows — founding-era data)',
  (SELECT COUNT(*) FROM season_money)
UNION ALL
SELECT
  'players (legacy 6 names present)',
  (SELECT COUNT(*) FROM players
    WHERE name IN ('Eric','Max','Hayden','Andrew','Brennan','Chase'))
ORDER BY table_scope;

-- ── Migration 006 schema checks ──────────────────────────────────────────────
-- The is_public_view column must exist and the founding league must be TRUE.
SELECT
  'is_public_view column exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'leagues' AND column_name = 'is_public_view'
  ) AS passed
UNION ALL
SELECT
  'founding league is_public_view = true',
  (SELECT is_public_view FROM leagues WHERE id = '00000000-0000-0000-0000-000000000001')
UNION ALL
SELECT
  'tournaments_league_id_idx exists',
  EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'tournaments' AND indexname = 'tournaments_league_id_idx'
  );

-- ── RLS policy inventory ─────────────────────────────────────────────────────
-- Confirm the new policies exist on each scoped table.
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tournaments','picks','results','golfer_results','season_money','league_members')
ORDER BY tablename, cmd, policyname;

-- ── Sanity check: founding-league data is unchanged ──────────────────────────
-- Re-lists the founding league's tournaments and the season_money leaderboard
-- so you can compare visually with the pre-flight output.
SELECT
  id,
  name,
  date,
  status,
  is_major,
  golfers_cut
FROM tournaments
WHERE league_id = '00000000-0000-0000-0000-000000000001'
ORDER BY date ASC;

SELECT
  player_name,
  total
FROM season_money
ORDER BY total DESC;

-- ── RLS behavioral test: service_role (this session) bypasses RLS ────────────
-- When you run this in the SQL editor you are acting as `postgres` / service
-- role, so these queries will return rows regardless of RLS. To prove RLS is
-- actually enforcing isolation for the anon and authenticated roles, run:
--
--   SET ROLE anon;
--   SELECT COUNT(*) FROM tournaments WHERE league_id = '00000000-0000-0000-0000-000000000001';
--   -- Expected: returns the full count (EAGLE1 is public_view = true)
--   SELECT COUNT(*) FROM tournaments WHERE league_id <> '00000000-0000-0000-0000-000000000001';
--   -- Expected: 0 — custom leagues are NOT readable by anon
--   RESET ROLE;
--
-- (Uncomment the block below to execute the role-switch test in-place.)
--
-- DO $$
-- DECLARE
--   anon_public_count   integer;
--   anon_private_count  integer;
-- BEGIN
--   SET LOCAL ROLE anon;
--   SELECT COUNT(*) INTO anon_public_count  FROM tournaments WHERE league_id = '00000000-0000-0000-0000-000000000001';
--   SELECT COUNT(*) INTO anon_private_count FROM tournaments WHERE league_id <> '00000000-0000-0000-0000-000000000001';
--   RAISE NOTICE 'anon sees % founding tournaments (should be > 0)',  anon_public_count;
--   RAISE NOTICE 'anon sees % non-founding tournaments (should be 0)', anon_private_count;
-- END $$;
