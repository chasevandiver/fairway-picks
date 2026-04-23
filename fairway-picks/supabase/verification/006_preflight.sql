-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT: Capture baseline counts for The Original League (EAGLE1)
-- Run this in the Supabase SQL editor BEFORE applying migration 006.
-- Save the results — you will re-run 006_postflight.sql after the migration
-- and the numbers MUST match exactly.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- Sanity checks: the RBC Heritage tournament must exist and be intact.
SELECT
  id,
  name,
  course,
  date,
  status,
  league_id
FROM tournaments
WHERE name ILIKE '%RBC Heritage%'
   OR name ILIKE '%Heritage%'
ORDER BY date DESC;

-- Full tournament roster for the founding league (what must survive the migration unchanged):
SELECT
  id,
  name,
  date,
  status,
  is_major
FROM tournaments
WHERE league_id = '00000000-0000-0000-0000-000000000001'
ORDER BY date ASC;

-- Per-tournament results + golfers_cut (on the results table, not tournaments):
SELECT
  t.name          AS tournament,
  r.player_name,
  r.total_score,
  r.rank,
  r.has_winner,
  r.has_top3,
  r.money_won,
  r.golfers_cut
FROM results r
JOIN tournaments t ON t.id = r.tournament_id
WHERE t.league_id = '00000000-0000-0000-0000-000000000001'
ORDER BY t.date ASC, r.rank ASC;

-- Season money leaderboard snapshot (used to prove stats are preserved):
SELECT
  player_name,
  total
FROM season_money
ORDER BY total DESC;
