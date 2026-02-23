import type { GolferScore, PlayerStanding, Pick, Player } from './types'
import { PLAYERS, PAYOUT_RULES } from './types'

export function toRelScore(s: number | null | undefined): string {
  if (s === null || s === undefined || isNaN(s)) return '—'
  if (s === 0) return 'E'
  return s > 0 ? `+${s}` : `${s}`
}

export function scoreClass(s: number | null | undefined): string {
  if (s === null || s === undefined || isNaN(s)) return 'even'
  if (s < 0) return 'under'
  if (s > 0) return 'over'
  return 'even'
}

export function formatMoney(v: number): string {
  if (v === 0) return '$0'
  return v > 0 ? `+$${v}` : `-$${Math.abs(v)}`
}

export function moneyClass(v: number): string {
  if (v > 0) return 'pos'
  if (v < 0) return 'neg'
  return 'zero'
}

/** Build pick map from flat picks array */
export function buildPickMap(picks: Pick[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const p of picks) {
    if (!map[p.player_name]) map[p.player_name] = []
    map[p.player_name].push(p.golfer_name)
  }
  return map
}

/** Compute standings from live scores + picks */
export function computeStandings(
  liveData: GolferScore[],
  pickMap: Record<string, string[]>
): PlayerStanding[] {
  const standings = PLAYERS.map((player) => {
    const playerPicks = pickMap[player] || []
    let totalScore = 0

    const golfers = playerPicks.map((name) => {
      const g = liveData.find(
        (d) => d.name.toLowerCase() === name.toLowerCase()
      ) ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active' as const }

      let adjScore = g.score ?? 0
      // Cut rule: repeat R1+R2 for R3+R4 → total = 2× the 2-round score
      if (g.status === 'cut' && g.score !== null) adjScore = g.score * 2
      // WD rule: same doubling approach
      if (g.status === 'wd' && g.score !== null) adjScore = g.score * 2

      // Build display rounds: for cut/wd, fill in repeated rounds
      const gAny = g as any
      const displayRounds = [...(gAny.rounds || [null, null, null, null])]
      if (g.status === 'cut' || g.status === 'wd') {
        displayRounds[2] = displayRounds[0]
        displayRounds[3] = displayRounds[1]
      }

      totalScore += adjScore
      return { ...g, adjScore, displayRounds }
    })

    // Strip "T" prefix from positions like "T2", "T3" before parsing
    const parsePos = (p: string) => parseInt(p.replace(/^T/, ''))

    const hasWinner = golfers.some((g) => {
      const pos = parsePos(g.position)
      return pos === 1  // covers both "1" and "T1"
    })
    const hasTop3 = golfers.some((g) => {
      const pos = parsePos(g.position)
      return !isNaN(pos) && pos <= 3  // covers 1, 2, 3, T1, T2, T3
    })

    return { player, totalScore, golfers, hasWinner, hasTop3, rank: 0, moneyThisWeek: 0 }
  })

  standings.sort((a, b) => a.totalScore - b.totalScore)
  return standings.map((s, i) => ({ ...s, rank: i + 1 }))
}

/** Calculate money owed based on standings */
export function computeMoney(standings: PlayerStanding[]): Record<string, number> {
  const money: Record<string, number> = {}
  PLAYERS.forEach((p) => (money[p] = 0))

  if (!standings.length) return money

  // Lowest strokes
  const winner = standings[0]
  const others = PLAYERS.filter((p) => p !== winner.player)
  money[winner.player] += PAYOUT_RULES.lowestStrokes * others.length
  others.forEach((p) => (money[p] -= PAYOUT_RULES.lowestStrokes))

  // Outright tour winner
  standings.forEach((s) => {
    if (s.hasWinner) {
      const oth = PLAYERS.filter((p) => p !== s.player)
      money[s.player] += PAYOUT_RULES.outrightWinner * oth.length
      oth.forEach((p) => (money[p] -= PAYOUT_RULES.outrightWinner))
    }
  })

  // Top 3 golfer
  standings.forEach((s) => {
    if (s.hasTop3) {
      const oth = PLAYERS.filter((p) => p !== s.player)
      money[s.player] += PAYOUT_RULES.top3 * oth.length
      oth.forEach((p) => (money[p] -= PAYOUT_RULES.top3))
    }
  })

  return money
}

/** Generate snake draft order */
export function snakeDraftOrder(players: string[], picksPerPlayer: number) {
  const order: { player: string; pick: number; round: number }[] = []
  for (let round = 0; round < picksPerPlayer; round++) {
    const r = round % 2 === 0 ? [...players] : [...players].reverse()
    r.forEach((p, i) =>
      order.push({ player: p, pick: round * players.length + i + 1, round })
    )
  }
  return order
}
