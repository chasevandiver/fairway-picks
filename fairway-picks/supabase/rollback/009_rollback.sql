-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 009 (league-scoped season money).
-- Restores the pre-009 shape: global UNIQUE(player_name), public SELECT,
-- founding-member writes. The league_id column is dropped (it was fully
-- backfilled from a constant, so no information is lost).
-- Backup table backup_season_money_009 is left in place.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP POLICY IF EXISTS "season_money_select_member_or_public" ON season_money;
DROP POLICY IF EXISTS "season_money_write_member"            ON season_money;

DROP INDEX IF EXISTS season_money_league_player_key;

ALTER TABLE season_money DROP COLUMN IF EXISTS league_id;

ALTER TABLE season_money
  ADD CONSTRAINT season_money_player_name_key UNIQUE (player_name);

-- Restore the 006-era policies.
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

COMMIT;
