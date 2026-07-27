import { describe, it, expect } from 'vitest'
import {
  toRelScore,
  scoreClass,
  formatMoney,
  buildPickMap,
  getCurrentRound,
  buildCutDisplayRounds,
  computeStandings,
  computeMoney,
  snakeDraftOrder,
  formatWinnerPlayer,
  parseWinnerPlayers,
} from '../scoring'
import type { GolferScore } from '../types'
import { DEFAULT_RULES } from '../rules'

// Characterization tests: these pin the CURRENT behavior of the scoring engine
// (as used by the founding league) before the rules-aware refactor. The founding
// league has always scored with cut-doubling and $10/$10/$5 payouts — any change
// that breaks these assertions changes historical results.

function golfer(over: Partial<GolferScore> & { name: string }): GolferScore {
  return {
    position: '—',
    score: null,
    today: null,
    thru: '—',
    status: 'active',
    rounds: [null, null, null, null],
    par: 72,
    ...over,
  }
}

const PLAYERS = ['Eric', 'Max', 'Hayden', 'Andrew', 'Brennan', 'Chase']

describe('formatting helpers', () => {
  it('toRelScore', () => {
    expect(toRelScore(0)).toBe('E')
    expect(toRelScore(-3)).toBe('-3')
    expect(toRelScore(4)).toBe('+4')
    expect(toRelScore(null)).toBe('—')
    expect(toRelScore(NaN)).toBe('—')
  })

  it('scoreClass / formatMoney', () => {
    expect(scoreClass(-1)).toBe('under')
    expect(scoreClass(1)).toBe('over')
    expect(scoreClass(0)).toBe('even')
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(25)).toBe('+$25')
    expect(formatMoney(-15)).toBe('-$15')
  })
})

describe('buildPickMap', () => {
  it('groups picks by player preserving order', () => {
    const map = buildPickMap([
      { id: '1', tournament_id: 't', player_name: 'Eric', golfer_name: 'A', pick_order: 1 },
      { id: '2', tournament_id: 't', player_name: 'Max', golfer_name: 'B', pick_order: 2 },
      { id: '3', tournament_id: 't', player_name: 'Eric', golfer_name: 'C', pick_order: 12 },
    ])
    expect(map).toEqual({ Eric: ['A', 'C'], Max: ['B'] })
  })
})

describe('getCurrentRound', () => {
  it('returns -1 with no data', () => {
    expect(getCurrentRound([golfer({ name: 'A' })])).toBe(-1)
  })

  it('returns highest completed round index', () => {
    expect(getCurrentRound([golfer({ name: 'A', rounds: [70, 71, null, null] })])).toBe(1)
  })

  it('detects a mid-round golfer as the next round in progress', () => {
    expect(
      getCurrentRound([golfer({ name: 'A', rounds: [70, 71, null, null], thru: '7', status: 'active' })])
    ).toBe(2)
  })
})

describe('buildCutDisplayRounds', () => {
  it('locks in full doubled display by default (R3=R1, R4=R2)', () => {
    expect(buildCutDisplayRounds([75, 74, null, null])).toEqual([75, 74, 75, 74])
  })

  it('phases in with currentRound', () => {
    expect(buildCutDisplayRounds([75, 74, null, null], 1)).toEqual([75, 74, null, null])
    expect(buildCutDisplayRounds([75, 74, null, null], 2)).toEqual([75, 74, 75, null])
    expect(buildCutDisplayRounds([75, 74, null, null], 3)).toEqual([75, 74, 75, 74])
  })
})

describe('computeStandings (founding-league behavior)', () => {
  const liveData: GolferScore[] = [
    golfer({ name: 'Leader Guy', position: '1', score: -10, status: 'active', rounds: [66, 68, 68, 68] }),
    golfer({ name: 'Second Guy', position: '2', score: -8, status: 'active', rounds: [68, 68, 68, 68] }),
    golfer({ name: 'Third Guy', position: '3', score: -6, status: 'active', rounds: [69, 68, 68, 69] }),
    golfer({ name: 'Mid Guy', position: 'T10', score: -2, status: 'active', rounds: [70, 70, 70, 70] }),
    golfer({ name: 'Cut Guy', position: 'CUT', score: 6, status: 'cut', rounds: [75, 75, null, null] }),
    golfer({ name: 'WD Guy', position: 'WD', score: 3, status: 'wd', rounds: [75, null, null, null] }),
  ]

  it('sums adjusted scores, doubling cut golfers', () => {
    const standings = computeStandings(
      liveData,
      { Eric: ['Leader Guy', 'Cut Guy'], Max: ['Second Guy', 'Third Guy'] },
      ['Eric', 'Max']
    )
    const eric = standings.find((s) => s.player === 'Eric')!
    const max = standings.find((s) => s.player === 'Max')!
    // Eric: -10 + (6 * 2 cut doubling) = +2 ; Max: -8 + -6 = -14
    expect(eric.totalScore).toBe(2)
    expect(max.totalScore).toBe(-14)
    expect(max.rank).toBe(1)
    expect(eric.rank).toBe(2)
  })

  it('cut golfer display rounds repeat R1/R2', () => {
    const standings = computeStandings(liveData, { Eric: ['Cut Guy'] }, ['Eric'])
    expect(standings[0].golfers[0].displayRounds).toEqual([75, 75, 75, 75])
  })

  it('WD golfers keep actual score, no penalty', () => {
    const standings = computeStandings(liveData, { Eric: ['WD Guy'] }, ['Eric'])
    expect(standings[0].totalScore).toBe(3)
  })

  it('unmatched golfer contributes 0 (current behavior)', () => {
    const standings = computeStandings(liveData, { Eric: ['Nobody Famous'] }, ['Eric'])
    expect(standings[0].totalScore).toBe(0)
  })

  it('hasWinner only for position 1; top3Count counts positions 2-3', () => {
    const standings = computeStandings(
      liveData,
      { Eric: ['Leader Guy', 'Second Guy', 'Third Guy'] },
      ['Eric']
    )
    expect(standings[0].hasWinner).toBe(true)
    expect(standings[0].top3Count).toBe(2)
  })

  it('ties on totalScore break by bestPosition; identical pairs share rank', () => {
    const standings = computeStandings(
      liveData,
      { Eric: ['Second Guy'], Max: ['Mid Guy'], Chase: ['Mid Guy'] },
      ['Eric', 'Max', 'Chase']
    )
    expect(standings[0].player).toBe('Eric')
    // Max and Chase tie exactly (same score, same bestPosition) → shared rank
    // 2. (The pre-rewrite implementation had a bug giving the second tied
    // player rank 0.)
    expect(standings[1].rank).toBe(2)
    expect(standings[2].rank).toBe(2)
  })
})

describe('computeMoney (founding-league behavior: $10/$10/$5)', () => {
  it('weekly winner collects from every other player', () => {
    const standings = computeStandings(
      [golfer({ name: 'A', position: '5', score: -5 }), golfer({ name: 'B', position: '8', score: -1 })],
      { Eric: ['A'], Max: ['B'], Hayden: [] },
      ['Eric', 'Max', 'Hayden']
    )
    const money = computeMoney(standings, ['Eric', 'Max', 'Hayden'])
    expect(money.Eric).toBe(20) // 10 from each of 2 others
    expect(money.Max).toBe(-10)
    expect(money.Hayden).toBe(-10)
  })

  it('outright winner and top3 bonuses stack per golfer', () => {
    const live = [
      golfer({ name: 'Champ', position: '1', score: -12 }),
      golfer({ name: 'Runner', position: '2', score: -10 }),
      golfer({ name: 'Third', position: '3', score: -9 }),
    ]
    const standings = computeStandings(live, { Eric: ['Champ', 'Runner', 'Third'] }, PLAYERS)
    const money = computeMoney(standings, PLAYERS)
    // Weekly winner: 10×5. Outright: 10×5. Top3 ×2 golfers: 5×5×2 = 50.
    expect(money.Eric).toBe(50 + 50 + 50)
    expect(money.Max).toBe(-30)
  })

  it('tied weekly winners split the pot instead of first-listed taking all', () => {
    const live = [golfer({ name: 'A', position: 'T5', score: -3 })]
    const standings = computeStandings(live, { Eric: ['A'], Max: ['A'], Hayden: [] }, ['Eric', 'Max', 'Hayden'])
    expect(standings[0].rank).toBe(1)
    expect(standings[1].rank).toBe(1)
    const money = computeMoney(standings, ['Eric', 'Max', 'Hayden'])
    // Hayden pays the normal $10 stake; Eric and Max split it $5/$5.
    expect(money.Eric).toBe(5)
    expect(money.Max).toBe(5)
    expect(money.Hayden).toBe(-10)
  })
})

describe('rules-aware scoring', () => {
  const cutLive = [
    golfer({ name: 'Cut Guy', position: 'CUT', score: 6, status: 'cut', rounds: [75, 75, null, null] }),
    golfer({ name: 'WD Guy', position: 'WD', score: 3, status: 'wd', rounds: [75, null, null, null] }),
    golfer({ name: 'Solid', position: '2', score: -8, status: 'active', rounds: [68, 68, 68, 68] }),
  ]

  it("cut_handling 'none' leaves the 36-hole score unpenalized", () => {
    const rules = { ...DEFAULT_RULES, penalties: { cut_handling: 'none' as const, wd_handling: 'use_actual' as const } }
    const standings = computeStandings(cutLive, { Eric: ['Cut Guy'] }, ['Eric'], rules)
    expect(standings[0].totalScore).toBe(6)
    expect(standings[0].golfers[0].displayRounds).toEqual([75, 75, null, null])
  })

  it("cut_handling 'average' behaves like 'double' (same total by definition)", () => {
    const rules = { ...DEFAULT_RULES, penalties: { cut_handling: 'average' as const, wd_handling: 'use_actual' as const } }
    const standings = computeStandings(cutLive, { Eric: ['Cut Guy'] }, ['Eric'], rules)
    expect(standings[0].totalScore).toBe(12)
  })

  it("wd_handling 'none' penalizes a WD like a cut", () => {
    const rules = { ...DEFAULT_RULES, penalties: { cut_handling: 'double' as const, wd_handling: 'none' as const } }
    const standings = computeStandings(cutLive, { Eric: ['WD Guy'] }, ['Eric'], rules)
    expect(standings[0].totalScore).toBe(6) // 3 doubled
  })

  it('major multiplier scales every payout', () => {
    const live = [golfer({ name: 'A', position: '5', score: -5 })]
    const standings = computeStandings(live, { Eric: ['A'], Max: [] }, ['Eric', 'Max'])
    const rules = { ...DEFAULT_RULES, multipliers: { major: 2 } }
    const normal = computeMoney(standings, ['Eric', 'Max'], rules, false)
    const major = computeMoney(standings, ['Eric', 'Max'], rules, true)
    expect(normal.Eric).toBe(10)
    expect(major.Eric).toBe(20)
    expect(major.Max).toBe(-20)
  })

  it("tiebreaker 'most_winners' beats bestPosition when configured", () => {
    const live = [
      golfer({ name: 'Champ', position: '1', score: -5 }),
      golfer({ name: 'Runner', position: '2', score: -5 }),
    ]
    const rules = { ...DEFAULT_RULES, tiebreaker: 'most_winners' as const }
    // Both players total -5. Max's golfer finished 2nd (better would win on
    // best_position is false here: 1 < 2 for Eric) — but with most_winners,
    // Eric holding the tournament winner is what breaks the tie.
    const standings = computeStandings(live, { Eric: ['Champ'], Max: ['Runner'] }, ['Eric', 'Max'], rules)
    expect(standings[0].player).toBe('Eric')
    expect(standings[0].rank).toBe(1)
    expect(standings[1].rank).toBe(2)
  })
})

describe('snakeDraftOrder', () => {
  it('reverses order on even rounds', () => {
    const order = snakeDraftOrder(['A', 'B', 'C'], 2)
    expect(order.map((o) => o.player)).toEqual(['A', 'B', 'C', 'C', 'B', 'A'])
    expect(order.map((o) => o.pick)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('formatWinnerPlayer / parseWinnerPlayers', () => {
  it('renders a single winner plainly', () => {
    expect(formatWinnerPlayer(['Chase'])).toBe('Chase')
  })

  it('renders co-winners as a tie', () => {
    expect(formatWinnerPlayer(['Brennan', 'Hayden'])).toBe('Brennan/Hayden (Tie)')
  })

  it('returns null when nobody finished first', () => {
    expect(formatWinnerPlayer([])).toBeNull()
  })

  it('round-trips through parseWinnerPlayers', () => {
    for (const names of [['Chase'], ['Brennan', 'Hayden'], ['Max', 'Andrew', 'Eric']]) {
      expect(parseWinnerPlayers(formatWinnerPlayer(names))).toEqual(names)
    }
  })

  it('parses the hardcoded 2023 tie string', () => {
    expect(parseWinnerPlayers('Brennan/Hayden (Tie)')).toEqual(['Brennan', 'Hayden'])
  })

  it('handles empty and missing winners', () => {
    expect(parseWinnerPlayers(null)).toEqual([])
    expect(parseWinnerPlayers(undefined)).toEqual([])
    expect(parseWinnerPlayers('')).toEqual([])
  })
})
