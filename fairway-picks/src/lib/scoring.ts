import type { Pick } from './types'
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

export function buildPickMap(picks: Pick[]): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const p of picks) {
    if (!map[p.player_name]) map[p.player_name] = []
    map[p.player_name].push(p.golfer_name)
  }
  return map
}

export function computeStandings(liveData: any[], pickMap: Record<string, string[]>): any[] {
  const standings = PLAYERS.map((player) => {
    const playerPicks = pickMap[player] || []
    let totalScore = 0

    const golfers = playerPicks.map((name) => {
      const g: any = liveData.find(
        (d: any) => d.name.toLowerCase() === name.toLowerCase()
      ) ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active', rounds: [null,null,null,null], par: 72 }

      let adjScore = g.score ?? 0
      if (g.status === 'cut' && g.score !== null) adjScore = g.score * 2
      if (g.status === 'wd' && g.score !== null) adjScore = g.score * 2

      const displayRounds = [...(g.rounds || [null, null, null, null])]
      if (g.status === 'cut' || g.status === 'wd') {
        displayRounds[2] = displayRounds[0]
        displayRounds[3] = displayRounds[1]
      }

      totalScore += adjScore
      return { ...g, adjScore, displayRounds }
    })

    const parsePos = (p: string): number => {
      if (!p || p === '—' || p === '-' || p.toUpperCase() === 'CUT' || p.toUpperCase() === 'WD') return NaN
      const n = parseInt(p.replace(/^T/i, ''))
      return n
    }
    const hasWinner = golfers.some((g: any) => parsePos(g.position) === 1)
    const hasTop3 = golfers.some((g: any) => {
      const pos = parsePos(g.position)
      return !isNaN(pos) && pos >= 1 && pos <= 3
    })

    return { player, totalScore, golfers, hasWinner, hasTop3, rank: 0, moneyThisWeek: 0 }
  })

  standings.sort((a, b) => a.totalScore - b.totalScore)
  return standings.map((s, i) => ({ ...s, rank: i + 1 }))
}

export function computeMoney(standings: any[]): Record<string, number> {
  const money: Record<string, number> = {}
  PLAYERS.forEach((p) => (money[p] = 0))
  if (!standings.length) return money

  const winner = standings[0]
  const others = PLAYERS.filter((p) => p !== winner.player)
  money[winner.player] += PAYOUT_RULES.lowestStrokes * others.length
  others.forEach((p) => (money[p] -= PAYOUT_RULES.lowestStrokes))

  standings.forEach((s) => {
    if (s.hasWinner) {
      const oth = PLAYERS.filter((p) => p !== s.player)
      money[s.player] += PAYOUT_RULES.outrightWinner * oth.length
      oth.forEach((p) => (money[p] -= PAYOUT_RULES.outrightWinner))
    }
  })

  standings.forEach((s) => {
    if (s.hasTop3) {
      const oth = PLAYERS.filter((p) => p !== s.player)
      money[s.player] += PAYOUT_RULES.top3 * oth.length
      oth.forEach((p) => (money[p] -= PAYOUT_RULES.top3))
    }
  })

  return money
}

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
