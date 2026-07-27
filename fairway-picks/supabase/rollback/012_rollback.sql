-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 012 (historical seasons).
--
-- Dropping the column also drops the partial index that depends on it.
--
-- WARNING: any tournaments imported as historical become ordinary tournaments
-- once the flag is gone, so their finishes and cuts start being counted on top
-- of the hardcoded ALL_STATS baseline — the exact double-count 012 exists to
-- prevent. Delete imported historical tournaments BEFORE rolling back:
--
--   DELETE FROM tournaments WHERE is_historical;   -- cascades to results
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP INDEX IF EXISTS tournaments_historical_idx;

ALTER TABLE tournaments DROP COLUMN IF EXISTS is_historical;

COMMIT;
