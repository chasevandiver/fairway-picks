// ─── League Rules System ──────────────────────────────────────────────────────
// Rules are stored as a JSONB blob on the leagues table.
// The DEFAULT_RULES represent the original "Fairway Picks" scoring system.
// When creating a league, start from DEFAULT_RULES and deep-merge any overrides.
// Never mutate rules once a tournament is active — use rules_snapshot on the
// tournament row to ensure historical scoring is always reproducible.

export interface LeagueRules {
  picks_per_player: number
  draft_format: 'snake'
  scoring: {
    weekly_winner: number    // $ per other player for lowest strokes
    outright_winner: number  // $ per other player for picking the tour winner
    top3_bonus: number       // $ per other player per top-3 finishing golfer
  }
  penalties: {
    cut_handling: 'none' | 'average' | 'double'
    wd_handling: 'none' | 'use_actual'
  }
  multipliers: {
    major: number  // multiply all payouts by this for majors (1 = no multiplier)
  }
  tiebreaker: 'best_position' | 'most_winners'
}

export const DEFAULT_RULES: LeagueRules = {
  picks_per_player: 4,
  draft_format: 'snake',
  scoring: {
    weekly_winner: 10,
    outright_winner: 10,
    top3_bonus: 5,
  },
  penalties: {
    cut_handling: 'average',
    wd_handling: 'use_actual',
  },
  multipliers: {
    major: 1,
  },
  tiebreaker: 'best_position',
}

/** Deep-merge user overrides onto DEFAULT_RULES. Safe to call with partial input. */
export function mergeRules(overrides: Partial<LeagueRules>): LeagueRules {
  return {
    ...DEFAULT_RULES,
    ...overrides,
    scoring: { ...DEFAULT_RULES.scoring, ...(overrides.scoring ?? {}) },
    penalties: { ...DEFAULT_RULES.penalties, ...(overrides.penalties ?? {}) },
    multipliers: { ...DEFAULT_RULES.multipliers, ...(overrides.multipliers ?? {}) },
  }
}
