-- ─────────────────────────────────────────────────────────────────────────────
-- Fore Picks · Auth Migration
-- Adds profiles and player_aliases tables for Supabase Auth integration.
-- Run after 001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Profiles ─────────────────────────────────────────────────────────────────
-- One row per authenticated user. display_name is what shows in the app.
CREATE TABLE IF NOT EXISTS profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email        TEXT NOT NULL,
  is_admin     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are publicly readable"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ── Player Aliases ────────────────────────────────────────────────────────────
-- Maps an auth user to a legacy player_name (e.g., "Eric", "Max").
-- When an existing league member signs up, they claim their historical name here.
-- This preserves all picks/results/season_money tied to that player_name.
CREATE TABLE IF NOT EXISTS player_aliases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(player_name)   -- each legacy name can only be claimed once
);

ALTER TABLE player_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aliases are publicly readable"
  ON player_aliases FOR SELECT USING (true);

CREATE POLICY "Users can insert their own alias"
  ON player_aliases FOR INSERT WITH CHECK (auth.uid() = user_id);
