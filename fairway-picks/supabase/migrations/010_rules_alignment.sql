-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Migration 010: Rules snapshot backfill
--
-- WHAT THIS DOES:
--   Backfills tournaments.rules_snapshot (frozen copy of the league rules at
--   activation time) for tournaments created before snapshots were written,
--   using their league's current rules. From here on, scoring reads the
--   snapshot — editing league rules can never retroactively change a
--   finalized week again.
--
-- NOTE on cut_handling: the founding league stores "average" while the code
--   has always doubled the 36-hole score. These are the same number —
--   R1+R2 + 2·avg(R1,R2) = 2·(R1+R2) — so no rules value needs changing;
--   the scoring engine accepts both spellings.
--
-- DATA SAFETY:
--   * Backup snapshot first; the only UPDATE fills NULL rules_snapshot.
--   * Transactional, idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS backup_tournaments_010 AS SELECT * FROM tournaments;

UPDATE tournaments t
   SET rules_snapshot = l.rules
  FROM leagues l
 WHERE l.id = t.league_id
   AND t.rules_snapshot IS NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'no tournament missing rules_snapshot' AS check_name,
  NOT EXISTS (
    SELECT 1 FROM tournaments WHERE league_id IS NOT NULL AND rules_snapshot IS NULL
  ) AS passed
UNION ALL
SELECT 'no tournament row count change',
  (SELECT COUNT(*) FROM tournaments) = (SELECT COUNT(*) FROM backup_tournaments_010);

-- Money-derivation parity check (informational): per-player SUM(money_won)
-- from results vs the season_money running totals. Record any mismatch —
-- it is PRE-EXISTING drift, and the app now derives standings money from
-- results, so season_money is display-legacy only.
SELECT r.player_name,
       SUM(r.money_won)                                            AS derived_from_results,
       (SELECT total FROM season_money sm
         WHERE sm.player_name = r.player_name
           AND sm.league_id = t.league_id)                         AS season_money_total
FROM results r
JOIN tournaments t ON t.id = r.tournament_id
WHERE t.league_id = '00000000-0000-0000-0000-000000000001'
GROUP BY r.player_name, t.league_id
ORDER BY r.player_name;
