-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback for migration 006 (custom league isolation).
--
-- Restores the state that existed after migration 003/005:
--   * Drops all new membership-scoped RLS policies
--   * Re-creates the legacy permissive policies (public read, anon write)
--   * Drops the is_public_view column and tournaments_league_id_idx
--
-- NO USER DATA IS TOUCHED — this is RLS + one column only. Run only if
-- post-flight verification showed a problem and you need to revert.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Drop new policies ────────────────────────────────────────────────────────
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
DROP POLICY IF EXISTS "golfer_results_insert_member"           ON golfer_results;
DROP POLICY IF EXISTS "golfer_results_update_member"           ON golfer_results;
DROP POLICY IF EXISTS "golfer_results_delete_member"           ON golfer_results;

DROP POLICY IF EXISTS "season_money_select_public"          ON season_money;
DROP POLICY IF EXISTS "season_money_write_founding_member"  ON season_money;

DROP POLICY IF EXISTS "league_members_select_self_leagues"  ON league_members;

-- ── Restore legacy policies (from migration 001 and 003) ─────────────────────
CREATE POLICY "public_read_tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "anon_write_tournaments"  ON tournaments FOR ALL    USING (true);

CREATE POLICY "public_read_picks"       ON picks       FOR SELECT USING (true);
CREATE POLICY "anon_write_picks"        ON picks       FOR ALL    USING (true);

CREATE POLICY "public_read_results"     ON results     FOR SELECT USING (true);
CREATE POLICY "anon_write_results"      ON results     FOR ALL    USING (true);

CREATE POLICY "public_read_season"      ON season_money FOR SELECT USING (true);
CREATE POLICY "anon_write_season"       ON season_money FOR ALL    USING (true);

CREATE POLICY "golfer_results are publicly readable" ON golfer_results FOR SELECT USING (true);
CREATE POLICY "golfer_results anon insert"           ON golfer_results FOR INSERT WITH CHECK (true);
CREATE POLICY "golfer_results anon update"           ON golfer_results FOR UPDATE USING (true);
CREATE POLICY "golfer_results anon delete"           ON golfer_results FOR DELETE USING (true);

CREATE POLICY "League members are publicly readable" ON league_members FOR SELECT USING (true);

-- ── Drop the schema additions ────────────────────────────────────────────────
DROP INDEX IF EXISTS tournaments_league_id_idx;
ALTER TABLE leagues DROP COLUMN IF EXISTS is_public_view;

COMMIT;
