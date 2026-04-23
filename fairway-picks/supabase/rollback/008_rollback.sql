-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback for migration 008 (league_roster).
-- Drops the table and its RLS policies. No tournament / pick / result / money
-- data is touched — league_roster was additive.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP POLICY IF EXISTS "league_roster_select_member_or_public"    ON league_roster;
DROP POLICY IF EXISTS "league_roster_insert_self_or_commissioner" ON league_roster;
DROP POLICY IF EXISTS "league_roster_update_commissioner"        ON league_roster;
DROP POLICY IF EXISTS "league_roster_delete_commissioner"        ON league_roster;

DROP INDEX  IF EXISTS league_roster_league_user_unique;
DROP INDEX  IF EXISTS league_roster_league_idx;
DROP TABLE  IF EXISTS league_roster;

COMMIT;
