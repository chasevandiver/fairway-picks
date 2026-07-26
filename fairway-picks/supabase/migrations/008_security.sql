-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 008: Security lockdown
--
-- WHAT THIS DOES:
--   1. profiles: adds WITH CHECK to the self-update policy and locks the
--      is_admin column at the SQL-privilege level so no anon-key client can
--      grant itself admin (previously any signed-in user could set
--      is_admin = true on their own row).
--   2. leagues: replaces the public SELECT (USING true) — which let anyone
--      enumerate every league's invite code — with member-or-commissioner
--      visibility. Guest/public reads go through the service-role API, which
--      redacts invite codes for non-members. Binds INSERT to the creator
--      (commissioner_id must be auth.uid()) and adds a commissioner DELETE
--      policy.
--   3. league_members: joining now requires knowing the invite code, enforced
--      in the database via the SECURITY DEFINER function
--      join_league_by_code(). Direct INSERT is only allowed for a league's
--      commissioner adding themself (the create-league flow). Adds a
--      commissioner DELETE policy (remove member) alongside the existing
--      self-delete (leave league).
--   4. player_aliases: adds the UNIQUE(user_id) constraint the app's upserts
--      have always assumed (onConflict: 'user_id'), plus self UPDATE/DELETE
--      policies.
--   5. Backfills: is_admin for the users aliased to Eric/Chase (the client
--      will no longer write this flag itself), and the founding league's
--      commissioner (the user aliased to Chase) so commissioner-gated
--      actions — including the rules editor, which has silently never worked
--      for the founding league — function.
--
-- DATA SAFETY:
--   * Begins with backup snapshots of every table it touches.
--   * The only row updates are the two additive backfills (is_admin,
--     commissioner_id) plus an idempotent re-assert of the founding league's
--     is_public_view. No row is deleted.
--   * Transactional and idempotent.
--
-- RUN INSTRUCTIONS:
--   1. Run verification/008_preflight.sql first and save the output.
--   2. Paste this entire file into the Supabase SQL editor and Run.
--   3. Run verification/008_postflight.sql and compare.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 0. Backup snapshots ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backup_profiles_008       AS SELECT * FROM profiles;
CREATE TABLE IF NOT EXISTS backup_leagues_008        AS SELECT * FROM leagues;
CREATE TABLE IF NOT EXISTS backup_league_members_008 AS SELECT * FROM league_members;
CREATE TABLE IF NOT EXISTS backup_player_aliases_008 AS SELECT * FROM player_aliases;

-- ── 1. profiles: self-update only, is_admin unwritable via API roles ─────────
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Column-level lockdown: the anon/authenticated roles may only touch the
-- columns the app legitimately writes. is_admin is excluded, so even a policy
-- bug can never allow self-promotion. (SELECT/DELETE privileges untouched.)
-- (id stays in the UPDATE grant because PostgREST upserts include every
-- payload column in the ON CONFLICT SET list; the WITH CHECK above still
-- pins the row to auth.uid().)
REVOKE INSERT, UPDATE ON profiles FROM anon, authenticated;
GRANT INSERT (id, display_name, email) ON profiles TO authenticated;
GRANT UPDATE (id, display_name, email) ON profiles TO authenticated;

-- Backfill: the two historical admins, previously self-asserted client-side.
UPDATE profiles
   SET is_admin = true
 WHERE id IN (
   SELECT user_id FROM player_aliases WHERE player_name IN ('Eric', 'Chase')
 );

-- ── 2. leagues: no more public enumeration ───────────────────────────────────
DROP POLICY IF EXISTS "Leagues are publicly readable"          ON leagues;
DROP POLICY IF EXISTS "Authenticated users can create leagues" ON leagues;
DROP POLICY IF EXISTS "Commissioner can update league"         ON leagues;
DROP POLICY IF EXISTS "leagues_select_member_or_commissioner"  ON leagues;
DROP POLICY IF EXISTS "leagues_insert_as_commissioner"         ON leagues;
DROP POLICY IF EXISTS "leagues_update_commissioner"            ON leagues;
DROP POLICY IF EXISTS "leagues_delete_commissioner"            ON leagues;

CREATE POLICY "leagues_select_member_or_commissioner" ON leagues
  FOR SELECT USING (
    commissioner_id = auth.uid()
    OR public.is_league_member(id, auth.uid())
  );

-- Creating a league binds the creator as commissioner — you cannot create a
-- league on someone else's behalf.
CREATE POLICY "leagues_insert_as_commissioner" ON leagues
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND commissioner_id = auth.uid()
  );

CREATE POLICY "leagues_update_commissioner" ON leagues
  FOR UPDATE
  USING (auth.uid() = commissioner_id)
  WITH CHECK (auth.uid() = commissioner_id);

CREATE POLICY "leagues_delete_commissioner" ON leagues
  FOR DELETE USING (auth.uid() = commissioner_id);

-- Founding-league backfills (idempotent):
--   * commissioner = the user aliased to Chase (repo owner). Eric keeps
--     platform admin via profiles.is_admin.
--   * is_public_view stays true (guests can watch, never write).
UPDATE leagues
   SET commissioner_id = (
     SELECT user_id FROM player_aliases WHERE player_name = 'Chase' LIMIT 1
   )
 WHERE id = '00000000-0000-0000-0000-000000000001'
   AND commissioner_id IS NULL;

UPDATE leagues
   SET is_public_view = true
 WHERE id = '00000000-0000-0000-0000-000000000001'
   AND is_public_view = false;

-- ── 3. league_members: join only via invite code (or commissioner self-join) ─
DROP POLICY IF EXISTS "Authenticated users can join leagues"   ON league_members;
DROP POLICY IF EXISTS "league_members_insert_commissioner_self" ON league_members;
DROP POLICY IF EXISTS "league_members_delete_commissioner"      ON league_members;

-- Direct INSERT is reserved for the create-league flow: the commissioner
-- adding themself. Everyone else joins through join_league_by_code(), which
-- runs as SECURITY DEFINER and bypasses this policy after validating the code.
CREATE POLICY "league_members_insert_commissioner_self" ON league_members
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = league_members.league_id
         AND l.commissioner_id = auth.uid()
    )
  );

-- Commissioner can remove members ("Members can leave leagues" self-delete
-- from migration 003 remains in place).
CREATE POLICY "league_members_delete_commissioner" ON league_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM leagues l
       WHERE l.id = league_members.league_id
         AND l.commissioner_id = auth.uid()
    )
  );

-- Membership lookups by user ("my leagues") get a proper index — the existing
-- UNIQUE(league_id, user_id) can't serve user_id-leading scans.
CREATE INDEX IF NOT EXISTS league_members_user_id_idx ON league_members(user_id);

-- ── 4. join_league_by_code() ─────────────────────────────────────────────────
-- The one sanctioned way to join a league: present a valid invite code.
-- SECURITY DEFINER so it can read leagues and insert membership regardless of
-- the caller's RLS visibility. Raises on bad codes; idempotent on re-join.
CREATE OR REPLACE FUNCTION public.join_league_by_code(p_code text)
RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_league leagues%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT * INTO v_league
    FROM leagues l
   WHERE upper(l.invite_code) = upper(trim(p_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid invite code';
  END IF;

  INSERT INTO league_members (league_id, user_id)
  VALUES (v_league.id, auth.uid())
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('league_id', v_league.id, 'league_name', v_league.name);
END;
$$;

REVOKE ALL ON FUNCTION public.join_league_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_league_by_code(text) TO authenticated;

-- ── 5. player_aliases: make the app's upserts actually work ──────────────────
-- The app has always written aliases with onConflict: 'user_id', but only
-- UNIQUE(player_name) existed — those upserts could never resolve conflicts.
-- Preflight (verification/008_preflight.sql) confirms no duplicate user_ids.
DO $$
BEGIN
  IF EXISTS (
    SELECT user_id FROM player_aliases GROUP BY user_id HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'player_aliases has duplicate user_id rows — resolve before adding UNIQUE(user_id)';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS player_aliases_user_id_key ON player_aliases(user_id);

DROP POLICY IF EXISTS "player_aliases_update_self" ON player_aliases;
DROP POLICY IF EXISTS "player_aliases_delete_self" ON player_aliases;

CREATE POLICY "player_aliases_update_self" ON player_aliases
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "player_aliases_delete_self" ON player_aliases
  FOR DELETE USING (auth.uid() = user_id);

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- DONE. Run verification/008_postflight.sql to confirm.
-- ─────────────────────────────────────────────────────────────────────────────
