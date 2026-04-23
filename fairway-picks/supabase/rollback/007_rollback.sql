-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback for migration 007. Restores the (broken) self-referencing policy
-- from migration 006 and drops the helper function. Do NOT run this unless
-- you specifically need the old policy back — the broken version will make
-- league creation / upsert fail again with the infinite-recursion error.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP POLICY IF EXISTS "league_members_select_self_or_peers" ON league_members;
DROP FUNCTION  IF EXISTS public.is_league_member(uuid, uuid);

CREATE POLICY "league_members_select_self_leagues" ON league_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM league_members m2
       WHERE m2.league_id = league_members.league_id
         AND m2.user_id  = auth.uid()
    )
  );

COMMIT;
