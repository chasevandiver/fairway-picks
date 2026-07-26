-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT for migration 009 (league-scoped season money).
-- Run BEFORE applying 009 and SAVE THE OUTPUT — the postflight compares every
-- player's total against this snapshot. Money data must not change.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Full season_money snapshot (totals must be identical after 009).
SELECT player_name, total, updated_at
FROM season_money
ORDER BY player_name;

-- 2. Row count.
SELECT COUNT(*) AS season_money_rows FROM season_money;

-- 3. Cross-check: derived totals from results. Any mismatch here is
--    PRE-EXISTING drift between the running totals and the per-tournament
--    results — record it; migration 010/Phase-2 derivation will surface it.
SELECT r.player_name,
       SUM(r.money_won) AS derived_from_results,
       (SELECT total FROM season_money sm WHERE sm.player_name = r.player_name) AS season_money_total
FROM results r
JOIN tournaments t ON t.id = r.tournament_id
WHERE t.league_id = '00000000-0000-0000-0000-000000000001'
GROUP BY r.player_name
ORDER BY r.player_name;
