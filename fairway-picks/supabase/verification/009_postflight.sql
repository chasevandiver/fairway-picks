-- ─────────────────────────────────────────────────────────────────────────────
-- POST-FLIGHT for migration 009. Run AFTER applying 009.
-- Every total must match the preflight snapshot; every check must pass.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Totals (must match preflight exactly).
SELECT player_name, total, league_id
FROM season_money
ORDER BY player_name;

-- 2. Structural checks.
SELECT 'all rows belong to founding league' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM season_money
    WHERE league_id != '00000000-0000-0000-0000-000000000001'
  ) AS passed
UNION ALL
SELECT 'league_id NOT NULL',
  (SELECT is_nullable = 'NO' FROM information_schema.columns
    WHERE table_name = 'season_money' AND column_name = 'league_id')
UNION ALL
SELECT 'global UNIQUE(player_name) dropped',
  NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'season_money' AND constraint_name = 'season_money_player_name_key'
  )
UNION ALL
SELECT 'UNIQUE(league_id, player_name) exists',
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'season_money' AND indexname = 'season_money_league_player_key'
  )
UNION ALL
SELECT 'league-scoped policies in place',
  (SELECT COUNT(*) = 2 FROM pg_policies
    WHERE tablename = 'season_money'
      AND policyname IN ('season_money_select_member_or_public', 'season_money_write_member'))
UNION ALL
SELECT 'legacy policies removed',
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'season_money'
      AND policyname IN ('season_money_select_public', 'season_money_write_founding_member')
  )
UNION ALL
SELECT 'backup table matches original row count',
  (SELECT COUNT(*) FROM backup_season_money_009) = (SELECT COUNT(*) FROM season_money)
UNION ALL
SELECT 'no total changed vs backup',
  NOT EXISTS (
    SELECT 1 FROM season_money sm
    JOIN backup_season_money_009 b ON b.player_name = sm.player_name
    WHERE b.total IS DISTINCT FROM sm.total
  );
