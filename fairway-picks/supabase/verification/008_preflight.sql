-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT for migration 008 (security lockdown).
-- Run in the Supabase SQL editor BEFORE applying 008. Save the output —
-- 008_postflight.sql re-checks the same numbers after the migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Row counts of every table 008 touches (008 must not change any of these,
--    except profiles.is_admin values and leagues.commissioner_id).
SELECT 'profiles'       AS table_name, COUNT(*) AS row_count FROM profiles
UNION ALL SELECT 'leagues',        COUNT(*) FROM leagues
UNION ALL SELECT 'league_members', COUNT(*) FROM league_members
UNION ALL SELECT 'player_aliases', COUNT(*) FROM player_aliases
ORDER BY table_name;

-- 2. Duplicate-user_id check for player_aliases — 008 aborts if any rows here.
SELECT user_id, COUNT(*) AS alias_count
FROM player_aliases
GROUP BY user_id
HAVING COUNT(*) > 1;

-- 3. Who will be granted is_admin by the backfill (users aliased Eric/Chase).
SELECT pa.player_name, p.id, p.display_name, p.is_admin AS is_admin_before
FROM player_aliases pa
JOIN profiles p ON p.id = pa.user_id
WHERE pa.player_name IN ('Eric', 'Chase');

-- 4. Founding league state before the commissioner backfill.
SELECT id, name, invite_code, commissioner_id, is_public_view
FROM leagues
WHERE id = '00000000-0000-0000-0000-000000000001';
