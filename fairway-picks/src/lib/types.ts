export type Player = 'Eric' | 'Max' | 'Hayden' | 'Andrew' | 'Brennan' | 'Chase'

export const PLAYERS: Player[] = ['Eric', 'Max', 'Hayden', 'Andrew', 'Brennan', 'Chase']

export const PAYOUT_RULES = {
  lowestStrokes: 10,  // per other player
  outrightWinner: 10, // per other player
  top3: 5,            // per other player
}

export interface Tournament {
  id: string
  name: string
  course: string
  date: string
  status: 'upcoming' | 'active' | 'finalized'
  draft_order: string[]
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
  hasTop3: boolean
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
}
