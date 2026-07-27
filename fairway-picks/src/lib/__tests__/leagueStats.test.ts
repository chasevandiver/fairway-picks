import { describe, it, expect } from 'vitest'
import {
  appEraCounts, derivePars, weekendSplit, sundayCharge, parOrBetterRate,
  draftSlotValue, chalkVsSleeper, moneyPerGolfer, nemesisGolfers, bounceBack,
  heartbreakers, golferValue, playerRates, recordBook, positionValue, byDate,
  type HistoryEntry, type GolferResult, type HistoryPick,
} from '../leagueStats'

const PLAYERS = ['Chase', 'Max']

// Par 72. A golfer with four rounds and a to-par score lets derivePars solve
// par = (strokes - score) / 4.
function gr(over: Partial<GolferResult> & { player_name: string; golfer_name: string }): GolferResult {
  const rounds = over.rounds ?? [72, 72, 72, 72]
  const strokes = (rounds as (number | null)[]).reduce((s: number, v) => s + (v ?? 0), 0)
  return {
    tournament_id: 't1',
    position: '10',
    status: 'active',
    score: strokes - 4 * 72,
    adj_score: strokes - 4 * 72,
    rounds,
    ...over,
  }
}

function ev(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return { tournament_id: 't1', tournament_name: 'Event', date: '2026-01-08', standings: [], money: {}, ...over }
}

describe('positionValue', () => {
  it('strips the tie prefix and rejects cut golfers', () => {
    expect(positionValue({ position: 'T13', status: 'active' })).toBe(13)
    expect(positionValue({ position: '1', status: 'active' })).toBe(1)
    expect(positionValue({ position: 'T13', status: 'cut' })).toBeNull()
    expect(positionValue({ position: '—', status: 'active' })).toBeNull()
  })
})

describe('byDate', () => {
  it('sorts chronologically regardless of input order', () => {
    const sorted = byDate([{ date: '2026-03-01' }, { date: '2026-01-01' }, { date: '2026-02-01' }])
    expect(sorted.map(e => e.date)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })
})

describe('derivePars', () => {
  it('solves par from strokes and to-par score', () => {
    const pars = derivePars([gr({ player_name: 'Chase', golfer_name: 'A', rounds: [70, 71, 69, 72] })])
    expect(pars.t1).toBe(72)
  })

  it('ignores cut golfers, whose score carries the doubling penalty', () => {
    const cut = gr({ player_name: 'Chase', golfer_name: 'B', rounds: [75, 75, null, null], status: 'cut' })
    expect(derivePars([cut])).toEqual({})
  })

  it('rejects implausible pars rather than trusting a bad row', () => {
    const junk: GolferResult = {
      tournament_id: 't1', player_name: 'Chase', golfer_name: 'C',
      status: 'active', rounds: [40, 40, 40, 40], score: 0,
    }
    expect(derivePars([junk])).toEqual({})
  })

  it('takes the most common par when rows disagree', () => {
    const pars = derivePars([
      gr({ player_name: 'Chase', golfer_name: 'A', rounds: [70, 70, 70, 70] }),
      gr({ player_name: 'Chase', golfer_name: 'B', rounds: [71, 71, 71, 71] }),
      { tournament_id: 't1', player_name: 'Max', golfer_name: 'C', status: 'active', rounds: [70, 70, 70, 70], score: -8 - 4 },
    ])
    expect(pars.t1).toBe(72)
  })
})

describe('appEraCounts', () => {
  const history = [
    ev({ standings: [{ player: 'Chase', score: -4, rank: 1 }, { player: 'Max', score: 2, rank: 2 }] }),
    ev({ tournament_id: 't2', standings: [{ player: 'Chase', score: 1, rank: 1 }] }),
  ]
  const golfers = [
    gr({ player_name: 'Chase', golfer_name: 'Scheffler' }),
    gr({ player_name: 'Chase', golfer_name: 'Rahm' }),
    gr({ tournament_id: 't2', player_name: 'Chase', golfer_name: 'Scheffler' }),
    gr({ player_name: 'Max', golfer_name: 'Rahm' }),
  ]

  it('counts events entered per player', () => {
    expect(appEraCounts(history, golfers, PLAYERS).Chase.played).toBe(2)
    expect(appEraCounts(history, golfers, PLAYERS).Max.played).toBe(1)
  })

  it('counts total picks and distinct golfers separately', () => {
    const c = appEraCounts(history, golfers, PLAYERS).Chase
    expect(c.picked).toBe(3)
    expect(c.uniqueGolfers).toBe(2)
  })

  it('ignores players outside the roster', () => {
    const counts = appEraCounts(history, [...golfers, gr({ player_name: 'Stranger', golfer_name: 'X' })], PLAYERS)
    expect(Object.keys(counts).sort()).toEqual(['Chase', 'Max'])
  })

  it('returns zeroed rows for an empty league', () => {
    expect(appEraCounts([], [], PLAYERS)).toEqual({
      Chase: { played: 0, picked: 0, uniqueGolfers: 0 },
      Max: { played: 0, picked: 0, uniqueGolfers: 0 },
    })
  })
})

describe('weekendSplit', () => {
  it('measures R3+R4 against R1+R2, both relative to par', () => {
    // Chase: +4 over the first two, -4 over the weekend → delta -8.
    const rows = weekendSplit([gr({ player_name: 'Chase', golfer_name: 'A', rounds: [74, 74, 70, 70] })], PLAYERS)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ player: 'Chase', weekday: 4, weekend: -4, delta: -8 })
  })

  it('skips golfers with an incomplete card', () => {
    expect(weekendSplit([gr({ player_name: 'Chase', golfer_name: 'A', rounds: [70, 70, null, null] })], PLAYERS)).toEqual([])
  })

  it('sorts the best closers first', () => {
    const rows = weekendSplit([
      gr({ player_name: 'Chase', golfer_name: 'A', rounds: [74, 74, 70, 70] }),
      gr({ player_name: 'Max', golfer_name: 'B', rounds: [70, 70, 74, 74] }),
    ], PLAYERS)
    expect(rows.map(r => r.player)).toEqual(['Chase', 'Max'])
  })
})

describe('sundayCharge', () => {
  it('compares the final round to the player own average', () => {
    // Rounds -2,-2,-2,-8 → avg -3.5, R4 -8, delta -4.5
    const rows = sundayCharge([gr({ player_name: 'Chase', golfer_name: 'A', rounds: [70, 70, 70, 64] })], PLAYERS)
    expect(rows[0].finalRound).toBe(-8)
    expect(rows[0].baseline).toBeCloseTo(-3.5)
    expect(rows[0].delta).toBeCloseTo(-4.5)
  })
})

describe('parOrBetterRate', () => {
  it('counts rounds at or under par', () => {
    const rows = parOrBetterRate([gr({ player_name: 'Chase', golfer_name: 'A', rounds: [72, 71, 73, 74] })], PLAYERS)
    expect(rows[0]).toMatchObject({ good: 2, total: 4, rate: 0.5 })
  })
})

describe('draftSlotValue', () => {
  const picks: HistoryPick[] = [
    { tournament_id: 't1', player_name: 'Chase', golfer_name: 'Scheffler', pick_order: 1 },
    { tournament_id: 't1', player_name: 'Chase', golfer_name: 'Journeyman', pick_order: 4 },
  ]
  const golfers = [
    gr({ player_name: 'Chase', golfer_name: 'Scheffler', position: '1' }),
    gr({ player_name: 'Chase', golfer_name: 'Journeyman', status: 'cut', position: 'CUT' }),
  ]

  it('buckets outcomes by draft slot', () => {
    const rows = draftSlotValue(golfers, picks)
    expect(rows.map(r => r.pickOrder)).toEqual([1, 4])
    expect(rows[0]).toMatchObject({ avgFinish: 1, wins: 1, cutRate: 0, picks: 1 })
    expect(rows[1]).toMatchObject({ avgFinish: null, wins: 0, cutRate: 1, picks: 1 })
  })

  it('matches golfer names case-insensitively', () => {
    const rows = draftSlotValue(
      [gr({ player_name: 'Chase', golfer_name: 'SCHEFFLER', position: '1' })],
      [{ tournament_id: 't1', player_name: 'Chase', golfer_name: 'scheffler', pick_order: 1 }],
    )
    expect(rows[0].picks).toBe(1)
  })

  it('ignores golfers with no matching pick row', () => {
    expect(draftSlotValue(golfers, [])).toEqual([])
  })
})

describe('chalkVsSleeper', () => {
  it('averages the slot a player drafts at', () => {
    const rows = chalkVsSleeper([
      { tournament_id: 't1', player_name: 'Chase', golfer_name: 'A', pick_order: 1 },
      { tournament_id: 't1', player_name: 'Chase', golfer_name: 'B', pick_order: 3 },
      { tournament_id: 't1', player_name: 'Max', golfer_name: 'C', pick_order: 4 },
    ], PLAYERS)
    expect(rows[0]).toMatchObject({ player: 'Chase', avgSlot: 2, picks: 2 })
    expect(rows[1]).toMatchObject({ player: 'Max', avgSlot: 4 })
  })
})

describe('moneyPerGolfer', () => {
  it('divides season money by golfers drafted', () => {
    const history = [ev({ standings: [{ player: 'Chase', score: 0, rank: 1 }], money: { Chase: 40 } })]
    const golfers = [gr({ player_name: 'Chase', golfer_name: 'A' }), gr({ player_name: 'Chase', golfer_name: 'B' })]
    expect(moneyPerGolfer(history, golfers, PLAYERS)[0]).toMatchObject({ total: 40, golfers: 2, perGolfer: 20 })
  })

  it('omits players who never drafted', () => {
    expect(moneyPerGolfer([ev()], [], PLAYERS)).toEqual([])
  })
})

describe('nemesisGolfers', () => {
  it('finds the golfer who has been cut most on a roster', () => {
    const rows = nemesisGolfers([
      gr({ player_name: 'Chase', golfer_name: 'Fragile', status: 'cut' }),
      gr({ tournament_id: 't2', player_name: 'Chase', golfer_name: 'Fragile', status: 'cut' }),
      gr({ player_name: 'Chase', golfer_name: 'Steady' }),
    ], PLAYERS)
    expect(rows[0]).toMatchObject({ player: 'Chase', golfer: 'Fragile', cuts: 2, picks: 2 })
  })

  it('says nothing when a player has never been cut', () => {
    expect(nemesisGolfers([gr({ player_name: 'Chase', golfer_name: 'Steady' })], PLAYERS)).toEqual([])
  })
})

describe('bounceBack', () => {
  it('measures the week after losing money', () => {
    const history = [
      ev({ date: '2026-01-01', money: { Chase: -20 } }),
      ev({ date: '2026-01-08', money: { Chase: 30 } }),
      ev({ date: '2026-01-15', money: { Chase: -10 } }),
      ev({ date: '2026-01-22', money: { Chase: -5 } }),
    ]
    expect(bounceBack(history, PLAYERS)[0]).toMatchObject({ player: 'Chase', wins: 1, chances: 2, rate: 0.5 })
  })

  it('sorts by date, not by array order', () => {
    const history = [
      ev({ date: '2026-01-08', money: { Chase: 30 } }),
      ev({ date: '2026-01-01', money: { Chase: -20 } }),
    ]
    expect(bounceBack(history, PLAYERS)[0]).toMatchObject({ wins: 1, chances: 1 })
  })

  it('has nothing to say with a single event', () => {
    expect(bounceBack([ev({ money: { Chase: -20 } })], PLAYERS)).toEqual([])
  })
})

describe('heartbreakers', () => {
  it('counts weeks lost by exactly one stroke', () => {
    const history = [
      ev({ standings: [{ player: 'Chase', score: -4, rank: 1 }, { player: 'Max', score: -3, rank: 2 }] }),
      ev({ standings: [{ player: 'Chase', score: -9, rank: 1 }, { player: 'Max', score: 4, rank: 2 }] }),
    ]
    const rows = heartbreakers(history, PLAYERS)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ player: 'Max', count: 1 })
  })

  it('never counts the winner as heartbroken', () => {
    const history = [ev({ standings: [{ player: 'Chase', score: -4, rank: 1 }, { player: 'Max', score: -4, rank: 1 }] })]
    expect(heartbreakers(history, PLAYERS)).toEqual([])
  })
})

describe('golferValue', () => {
  it('splits a week credit across the roster that produced it', () => {
    const history = [ev({ money: { Chase: 40 } })]
    const golfers = [
      gr({ player_name: 'Chase', golfer_name: 'A' }),
      gr({ player_name: 'Chase', golfer_name: 'B' }),
    ]
    const rows = golferValue(history, golfers, PLAYERS)
    expect(rows).toHaveLength(2)
    expect(rows[0].money).toBe(20)
    expect(rows.reduce((s, r) => s + r.money, 0)).toBe(40)
  })

  it('records who drafted each golfer', () => {
    const history = [ev({ money: { Chase: 20, Max: -20 } })]
    const golfers = [
      gr({ player_name: 'Chase', golfer_name: 'Shared' }),
      gr({ player_name: 'Max', golfer_name: 'Shared' }),
    ]
    expect(golferValue(history, golfers, PLAYERS)[0].drafters).toEqual(['Chase', 'Max'])
  })

  it('honours the limit', () => {
    const history = [ev({ money: { Chase: 40 } })]
    const golfers = ['A', 'B', 'C'].map(n => gr({ player_name: 'Chase', golfer_name: n }))
    expect(golferValue(history, golfers, PLAYERS, 2)).toHaveLength(2)
  })
})

describe('playerRates', () => {
  it('reports podium and cash frequency over weeks played', () => {
    const history = [
      ev({ standings: [{ player: 'Chase', score: 0, rank: 1 }], money: { Chase: 30 } }),
      ev({ standings: [{ player: 'Chase', score: 0, rank: 5 }], money: { Chase: -10 } }),
    ]
    expect(playerRates(history, PLAYERS)[0]).toMatchObject({ played: 2, podiumRate: 0.5, cashRate: 0.5 })
  })

  it('excludes weeks a player sat out', () => {
    const history = [
      ev({ standings: [{ player: 'Chase', score: 0, rank: 1 }], money: { Chase: 30 } }),
      ev({ standings: [{ player: 'Max', score: 0, rank: 1 }], money: { Max: 30 } }),
    ]
    expect(playerRates(history, PLAYERS).find(r => r.player === 'Chase')?.played).toBe(1)
  })
})

describe('recordBook', () => {
  const history = [
    ev({
      date: '2026-01-01', tournament_name: 'Sentry',
      standings: [
        { player: 'Chase', score: -12, rank: 1, golfers_cut: 0 },
        { player: 'Max', score: 6, rank: 2, golfers_cut: 3 },
      ],
    }),
    ev({
      tournament_id: 't2', date: '2026-01-08', tournament_name: 'Sony',
      standings: [
        { player: 'Chase', score: 2, rank: 1, golfers_cut: 1 },
        { player: 'Max', score: 3, rank: 2, golfers_cut: 0 },
      ],
    }),
  ]

  it('records the low and high weekly totals with the week attached', () => {
    const book = recordBook(history, [], PLAYERS)
    expect(book.find(r => r.label === 'Lowest weekly total')).toMatchObject({ value: '-12', holder: 'Chase', detail: 'Sentry' })
    expect(book.find(r => r.label === 'Highest weekly total')).toMatchObject({ value: '+6', holder: 'Max' })
  })

  it('finds the biggest margin of victory', () => {
    expect(recordBook(history, [], PLAYERS).find(r => r.label === 'Biggest blowout'))
      .toMatchObject({ value: '18 shots', holder: 'Chase', detail: 'Sentry' })
  })

  it('finds the longest run of weekly wins', () => {
    expect(recordBook(history, [], PLAYERS).find(r => r.label === 'Longest win streak'))
      .toMatchObject({ value: '2 weeks', holder: 'Chase' })
  })

  it('finds the worst weekend wipeout', () => {
    expect(recordBook(history, [], PLAYERS).find(r => r.label === 'Worst weekend wipeout'))
      .toMatchObject({ value: '3 cut', holder: 'Max' })
  })

  it('treats sub-55 rounds as feed noise', () => {
    const noisy = [gr({ player_name: 'Chase', golfer_name: 'A', rounds: [12, 68, 70, 70] })]
    expect(recordBook(history, noisy, PLAYERS).find(r => r.label === 'Lowest single round'))
      .toMatchObject({ value: '68' })
  })

  it('returns nothing for an empty league', () => {
    expect(recordBook([], [], PLAYERS)).toEqual([])
  })
})
