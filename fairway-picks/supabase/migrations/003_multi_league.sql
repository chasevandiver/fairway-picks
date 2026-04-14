-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Multi-League Migration
-- Adds leagues, league_members, golfer_results tables.
-- Adds league_id + rules_snapshot to tournaments.
-- Creates a "founding league" for the original friend group so all existing
-- history is preserved under a real league row.
-- Run after 002_auth.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── golfer_results ────────────────────────────────────────────────────────────
-- Referenced in page.tsx but was missing from the initial schema migration.
CREATE TABLE IF NOT EXISTS golfer_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player_name   TEXT NOT NULL,
  golfer_name   TEXT NOT NULL,
  position      TEXT,
  score         INTEGER,
  adj_score     INTEGER,
  status        TEXT DEFAULT 'active',   -- 'active' | 'cut' | 'wd'
  rounds        INTEGER[],               -- [R1, R2, R3, R4] strokes
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, player_name, golfer_name)
);

ALTER TABLE golfer_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golfer_results are publicly readable" ON golfer_results FOR SELECT USING (true);
CREATE POLICY "golfer_results anon insert"           ON golfer_results FOR INSERT WITH CHECK (true);
CREATE POLICY "golfer_results anon update"           ON golfer_results FOR UPDATE USING (true);
CREATE POLICY "golfer_results anon delete"           ON golfer_results FOR DELETE USING (true);

-- ── leagues ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leagues (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  invite_code      TEXT NOT NULL UNIQUE,
  commissioner_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rules            JSONB NOT NULL DEFAULT '{
    "picks_per_player": 4,
    "draft_format": "snake",
    "scoring": {"weekly_winner": 10, "outright_winner": 10, "top3_bonus": 5},
    "penalties": {"cut_handling": "average", "wd_handling": "use_actual"},
    "multipliers": {"major": 1},
    "tiebreaker": "best_position"
  }'::jsonb,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leagues are publicly readable" ON leagues FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create leagues" ON leagues FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Commissioner can update league"         ON leagues FOR UPDATE USING (auth.uid() = commissioner_id);

-- ── league_members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS league_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, user_id)
);

ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "League members are publicly readable" ON league_members FOR SELECT USING (true);
CREATE POLICY "Authenticated users can join leagues" ON league_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members can leave leagues"            ON league_members FOR DELETE USING (auth.uid() = user_id);

-- ── Add league_id + rules_snapshot to tournaments ─────────────────────────────
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS league_id      UUID REFERENCES leagues(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS rules_snapshot JSONB;   -- frozen copy of rules at activation time

-- ── Founding League ───────────────────────────────────────────────────────────
-- Creates a league for the original private group (Eric, Max, Hayden, Andrew,
-- Brennan, Chase) so all existing tournament history is preserved.
-- The commissioner_id is left NULL until one of the founding members claims it.
INSERT INTO leagues (id, name, invite_code, commissioner_id, rules)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'The Original League',
  'EAGLE1',
  NULL,
  '{
    "picks_per_player": 4,
    "draft_format": "snake",
    "scoring": {"weekly_winner": 10, "outright_winner": 10, "top3_bonus": 5},
    "penalties": {"cut_handling": "average", "wd_handling": "use_actual"},
    "multipliers": {"major": 1},
    "tiebreaker": "best_position"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Associate all existing tournaments with the founding league
UPDATE tournaments
  SET league_id = '00000000-0000-0000-0000-000000000001'
WHERE league_id IS NULL;
