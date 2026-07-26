-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 008 (security lockdown).
--
-- ⚠️  Rolling back REOPENS the security holes 008 closed:
--     * every league (and invite code) becomes publicly readable again
--     * any authenticated user can insert themself into any league
--     * is_admin becomes client-writable again
-- Only use this if 008 broke the app and you need the pre-008 behavior back
-- while debugging.
--
-- Backup tables (backup_*_008) are left in place; restore data from them by
-- hand only if a row was genuinely lost (008 itself never deletes rows).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── profiles ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

GRANT INSERT, UPDATE ON profiles TO anon, authenticated;

-- (is_admin backfill is data, not schema — intentionally NOT reverted.)

-- ── leagues ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leagues_select_member_or_commissioner" ON leagues;
DROP POLICY IF EXISTS "leagues_insert_as_commissioner"        ON leagues;
DROP POLICY IF EXISTS "leagues_update_commissioner"           ON leagues;
DROP POLICY IF EXISTS "leagues_delete_commissioner"           ON leagues;

CREATE POLICY "Leagues are publicly readable" ON leagues FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create leagues" ON leagues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Commissioner can update league" ON leagues FOR UPDATE USING (auth.uid() = commissioner_id);

-- (commissioner_id / is_public_view backfills intentionally NOT reverted.)

-- ── league_members ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "league_members_insert_commissioner_self" ON league_members;
DROP POLICY IF EXISTS "league_members_delete_commissioner"      ON league_members;

CREATE POLICY "Authenticated users can join leagues" ON league_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP INDEX IF EXISTS league_members_user_id_idx;

-- ── join_league_by_code ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.join_league_by_code(text);

-- ── player_aliases ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "player_aliases_update_self" ON player_aliases;
DROP POLICY IF EXISTS "player_aliases_delete_self" ON player_aliases;
DROP INDEX IF EXISTS player_aliases_user_id_key;

COMMIT;
