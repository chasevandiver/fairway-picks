import { describe, it, expect } from 'vitest'
import {
  projectCutLine, cutWatch, holesLeftForGolfer, holesLeft, liveHeadToHead, sweatMeter,
} from '../live'
import type { GolferScore, PlayerStanding } from '../types'

function golfer(over: Partial<GolferScore> & { name: string }): GolferScore {
  return {
    position: '10', score: 0, today: 0, thru: 'F', status: 'active',
    rounds: [null, null, null, null], par: 72,
    ...over,
  }
}

/** A field wide enough for the percentile estimate to engage. */
function field(scores: number[]): GolferScore[] {
  return scores.map((s, i) => golfer({ name: `G${i}`, score: s }))
}

describe('projectCutLine', () => {
  it('returns null for a field too thin to estimate from', () => {
    expect(projectCutLine(field([0, 1, 2]))).toBeNull()
  })

  it('takes the 65th percentile of the active field', () => {
    // 40 golfers at 0..39; index floor(40 * 0.65) = 26.
    expect(projectCutLine(field(Array.from({ length: 40 }, (_, i) => i)))).toBe(26)
  })

  it('ignores golfers already cut', () => {
    const data = [
      ...field(Array.from({ length: 40 }, () => 0)),
      golfer({ name: 'Gone', score: 99, status: 'cut' }),
    ]
    expect(projectCutLine(data)).toBe(0)
  })

  it('ignores golfers with no score yet', () => {
    const data = [...field(Array.from({ length: 40 }, () => 3)), golfer({ name: 'Late', score: null })]
    expect(projectCutLine(data)).toBe(3)
  })
})

describe('cutWatch', () => {
  const pickMap = { Chase: ['Safe Sam', 'Bubble Bob'], Max: ['Doomed Dan', 'Gone Greg'] }
  const data = [
    golfer({ name: 'Safe Sam', score: -6 }),
    golfer({ name: 'Bubble Bob', score: 1 }),
    golfer({ name: 'Doomed Dan', score: 8 }),
    golfer({ name: 'Gone Greg', score: 12, status: 'cut' }),
    golfer({ name: 'Nobody', score: 0 }),
  ]

  it('classifies each drafted golfer against the line', () => {
    const rows = cutWatch(data, pickMap, 2)
    const by = Object.fromEntries(rows.map(r => [r.golfer, r]))
    expect(by['Safe Sam']).toMatchObject({ state: 'safe', cushion: 8, player: 'Chase' })
    expect(by['Bubble Bob']).toMatchObject({ state: 'bubble', cushion: 1 })
    expect(by['Doomed Dan']).toMatchObject({ state: 'danger', cushion: -6, player: 'Max' })
    expect(by['Gone Greg']).toMatchObject({ state: 'cut', cushion: null })
  })

  it('leaves undrafted golfers out', () => {
    expect(cutWatch(data, pickMap, 2).some(r => r.golfer === 'Nobody')).toBe(false)
  })

  it('sorts the most precarious first', () => {
    expect(cutWatch(data, pickMap, 2).map(r => r.state)).toEqual(['danger', 'bubble', 'safe', 'cut'])
  })

  it('still reports already-cut golfers when there is no line yet', () => {
    expect(cutWatch(data, pickMap, null).map(r => r.golfer)).toEqual(['Gone Greg'])
  })

  it('matches picks case-insensitively', () => {
    const rows = cutWatch([golfer({ name: 'SAFE SAM', score: -6 })], { Chase: ['safe sam'] }, 2)
    expect(rows[0]).toMatchObject({ player: 'Chase', state: 'safe' })
  })
})

describe('holesLeftForGolfer', () => {
  it('is zero for a finished round', () => {
    expect(holesLeftForGolfer(golfer({ name: 'A', thru: 'F' }))).toBe(0)
  })

  it('is zero for a cut golfer regardless of thru', () => {
    expect(holesLeftForGolfer(golfer({ name: 'A', thru: '9', status: 'cut' }))).toBe(0)
  })

  it('counts the balance of the round mid-play', () => {
    expect(holesLeftForGolfer(golfer({ name: 'A', thru: '11' }))).toBe(7)
  })

  it('is a full round for a golfer who has not teed off', () => {
    expect(holesLeftForGolfer(golfer({ name: 'A', thru: '—' }))).toBe(18)
  })
})

describe('holesLeft', () => {
  it('sums holes across a roster and ranks by who has most left', () => {
    const data = [
      golfer({ name: 'A', thru: '9' }),
      golfer({ name: 'B', thru: 'F' }),
      golfer({ name: 'C', thru: '—' }),
    ]
    const rows = holesLeft(data, { Chase: ['A', 'B'], Max: ['C'] }, ['Chase', 'Max'])
    expect(rows[0]).toMatchObject({ player: 'Max', holes: 18, golfersLeft: 1 })
    expect(rows[1]).toMatchObject({ player: 'Chase', holes: 9, golfersLeft: 1 })
  })

  it('handles a player whose golfers are missing from the feed', () => {
    expect(holesLeft([], { Chase: ['Ghost'] }, ['Chase'])[0]).toMatchObject({ holes: 0, golfersLeft: 0 })
  })
})

describe('liveHeadToHead', () => {
  const standings = [
    { player: 'Chase', totalScore: -10 },
    { player: 'Max', totalScore: -7 },
    { player: 'Hayden', totalScore: -12 },
  ] as PlayerStanding[]

  it('reports a signed margin against each opponent', () => {
    const rows = liveHeadToHead(standings, 'Chase')
    // Sorted best result first: 3 clear of Max, 2 behind Hayden.
    expect(rows).toEqual([
      { opponent: 'Max', margin: -3 },
      { opponent: 'Hayden', margin: 2 },
    ])
  })

  it('excludes the player themselves', () => {
    expect(liveHeadToHead(standings, 'Chase').some(r => r.opponent === 'Chase')).toBe(false)
  })

  it('is empty for someone not in the standings', () => {
    expect(liveHeadToHead(standings, 'Nobody')).toEqual([])
  })
})

describe('sweatMeter', () => {
  const pickMap = { Chase: ['Swinger'], Max: ['Anchor'] }
  const baseline = { Chase: 0, Max: 0 }

  it('picks the golfer whose movement shifts the most money', () => {
    // Swinger moves $10 between the two players; Anchor moves nothing.
    const rescore = (g: string, delta: number) =>
      g === 'Swinger' && delta < 0 ? { Chase: 10, Max: -10 } : { Chase: 0, Max: 0 }
    expect(sweatMeter(pickMap, baseline, rescore)).toMatchObject({ golfer: 'Swinger', player: 'Chase', swing: 10 })
  })

  it('returns null when no golfer changes anything', () => {
    expect(sweatMeter(pickMap, baseline, () => ({ Chase: 0, Max: 0 }))).toBeNull()
  })
})
