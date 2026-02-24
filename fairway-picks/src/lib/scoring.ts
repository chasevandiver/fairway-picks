import type { Pick } from './types'
import { PLAYERS, PAYOUT_RULES } from './types'

const PAR = 72

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

      // espn.ts now reliably sets status and position for cut golfers
      // but check position as belt-and-suspenders
      const isCut = g.status === 'cut' || String(g.position).toUpperCase() === 'CUT'
      const isWD  = g.status === 'wd'  || String(g.position).toUpperCase() === 'WD'
      const isCutOrWD = isCut || isWD

      const r1 = g.rounds?.[0] ?? null
      const r2 = g.rounds?.[1] ?? null
      let adjScore: number
      if (isCutOrWD && r1 !== null && r2 !== null) {
        const avg = Math.ceil((r1 + r2) / 2)
        adjScore = (r1 + r2 + avg + avg) - PAR * 4
      } else {
        adjScore = g.score ?? 0
      }

      const displayRounds = [...(g.rounds || [null, null, null, null])]
      if (isCutOrWD) {
        const r1 = displayRounds[0] ?? 0
        const r2 = displayRounds[1] ?? 0
        const avg = Math.ceil((r1 + r2) / 2)
        displayRounds[2] = avg
        displayRounds[3] = avg
      }

      // Stamp status so ScorecardRow always has it
      const stampedStatus = isWD ? 'wd' : isCut ? 'cut' : g.status

      totalScore += adjScore
      return { ...g, status: stampedStatus, adjScore, displayRounds }
    })

    const parsePos = (p: string) => parseInt((p || '').replace(/^T/, ''))
    const hasWinner = golfers.some((g: any) => parsePos(g.position) === 1)
    const hasTop3 = golfers.some((g: any) => {
      const pos = parsePos(g.position)
      return !isNaN(pos) && pos <= 3
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
