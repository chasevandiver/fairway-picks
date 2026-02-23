-- ─────────────────────────────────────────────────────────────────────────────
-- Fairway Picks · Supabase Schema
-- Run this in the Supabase SQL editor (Database → SQL Editor → New Query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Players table (the 5 friends)
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  course TEXT,
  date DATE,
  status TEXT DEFAULT 'upcoming', -- upcoming | active | finalized
  draft_order TEXT[], -- ordered list of player names for snake draft
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Picks table (each player's 4 golfers per tournament)
CREATE TABLE IF NOT EXISTS picks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  golfer_name TEXT NOT NULL,
  pick_order INTEGER NOT NULL, -- 1-4
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, player_name, pick_order)
);

-- Tournament results (finalized scores per player per tournament)
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  total_score INTEGER, -- strokes relative to par
  rank INTEGER,
  has_winner BOOLEAN DEFAULT false,
  has_top3 BOOLEAN DEFAULT false,
  money_won INTEGER DEFAULT 0, -- in dollars, can be negative
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tournament_id, player_name)
);

-- Season money summary (running totals)
CREATE TABLE IF NOT EXISTS season_money (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT UNIQUE NOT NULL,
  total INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed players
INSERT INTO players (name, is_admin) VALUES
  ('Eric', true),
  ('Max', false),
  ('Hayden', false),
  ('Andrew', false),
  ('Brennan', false)
ON CONFLICT (name) DO NOTHING;

-- Seed season money rows
INSERT INTO season_money (player_name, total) VALUES
  ('Eric', 0), ('Max', 0), ('Hayden', 0), ('Andrew', 0), ('Brennan', 0)
ON CONFLICT (player_name) DO NOTHING;

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Enable RLS but keep public read access so anyone with the URL can view
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_money ENABLE ROW LEVEL SECURITY;

-- Public read for everything
CREATE POLICY "public_read_players" ON players FOR SELECT USING (true);
CREATE POLICY "public_read_tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "public_read_picks" ON picks FOR SELECT USING (true);
CREATE POLICY "public_read_results" ON results FOR SELECT USING (true);
CREATE POLICY "public_read_season" ON season_money FOR SELECT USING (true);

-- Write access: allow anon (we use a simple name-based "login", not Supabase Auth)
-- In production you can tighten this with Supabase Auth magic links
CREATE POLICY "anon_write_tournaments" ON tournaments FOR ALL USING (true);
CREATE POLICY "anon_write_picks" ON picks FOR ALL USING (true);
CREATE POLICY "anon_write_results" ON results FOR ALL USING (true);
CREATE POLICY "anon_write_season" ON season_money FOR ALL USING (true);
