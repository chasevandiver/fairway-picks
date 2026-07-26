-- ─────────────────────────────────────────────────────────────────────────────
-- POST-FLIGHT for migration 008. Run AFTER applying 008.
-- Row counts must match the preflight exactly; every check below must pass.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Row counts (compare with preflight).
SELECT 'profiles'       AS table_name, COUNT(*) AS row_count FROM profiles
UNION ALL SELECT 'leagues',        COUNT(*) FROM leagues
UNION ALL SELECT 'league_members', COUNT(*) FROM league_members
UNION ALL SELECT 'player_aliases', COUNT(*) FROM player_aliases
ORDER BY table_name;

-- 2. Policy and privilege checks.
SELECT 'profiles update policy has WITH CHECK' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile'
      AND with_check IS NOT NULL
  ) AS passed
UNION ALL
SELECT 'is_admin not updatable by authenticated',
  NOT EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE')
  )
UNION ALL
SELECT 'leagues public SELECT policy dropped',
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leagues' AND policyname = 'Leagues are publicly readable'
  )
UNION ALL
SELECT 'leagues member/commissioner SELECT exists',
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'leagues' AND policyname = 'leagues_select_member_or_commissioner'
  )
UNION ALL
SELECT 'open league_members INSERT policy dropped',
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'league_members' AND policyname = 'Authenticated users can join leagues'
  )
UNION ALL
SELECT 'join_league_by_code() exists',
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'join_league_by_code'
  )
UNION ALL
SELECT 'player_aliases UNIQUE(user_id) exists',
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'player_aliases' AND indexname = 'player_aliases_user_id_key'
  )
UNION ALL
SELECT 'founding league has a commissioner',
  (SELECT commissioner_id IS NOT NULL FROM leagues
    WHERE id = '00000000-0000-0000-0000-000000000001')
UNION ALL
SELECT 'founding league still public-view',
  (SELECT is_public_view FROM leagues
    WHERE id = '00000000-0000-0000-0000-000000000001')
UNION ALL
SELECT 'Eric/Chase profiles are admins',
  NOT EXISTS (
    SELECT 1 FROM player_aliases pa JOIN profiles p ON p.id = pa.user_id
    WHERE pa.player_name IN ('Eric', 'Chase') AND p.is_admin = false
  )
UNION ALL
SELECT 'backup tables created',
  (SELECT COUNT(*) = 4 FROM information_schema.tables
    WHERE table_name IN ('backup_profiles_008', 'backup_leagues_008',
                         'backup_league_members_008', 'backup_player_aliases_008'));
