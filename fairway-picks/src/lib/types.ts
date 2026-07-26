export interface Tournament {
  id: string
  name: string
  course: string
  date: string
  status: 'upcoming' | 'active' | 'finalized'
  draft_order: string[]
  is_major?: boolean
  /** Frozen copy of the league rules at activation time. */
  rules_snapshot?: Record<string, unknown> | null
}

export interface Pick {
  id: string
  tournament_id: string
  player_name: string
  golfer_name: string
  pick_order: number
}

export interface GolferScore {
  name: string
  position: string
  score: number | null        // total relative to par
  today: number | null        // today's round relative to par
  thru: string                // "F", "14", "WD", etc.
  status: 'active' | 'cut' | 'wd'
  rounds: (number | null)[]   // raw strokes per round [R1, R2, R3, R4], null = not played
  par: number                 // course par (usually 72)
}

export interface PlayerStanding {
  player: string
  totalScore: number
  golfers: (GolferScore & { adjScore: number; displayRounds: (number | null)[] })[]
  hasWinner: boolean
  top3Count: number
  bestPosition: number  // lowest numeric finishing position among picks (Infinity if none); used as tiebreaker
  rank: number
  moneyThisWeek: number
}

export interface Result {
  tournament_id: string
  player_name: string
  total_score: number
  rank: number
  has_winner: boolean
  has_top3: boolean
  money_won: number
}

export interface SeasonMoney {
  player_name: string
  total: number
  league_id?: string
}
