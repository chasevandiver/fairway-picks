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

/**
 * Determine which rounds have actually started based on the live data.
 * A round has started if ANY active (non-cut) golfer has data for it.
 * Returns the highest round index (0-based) that has started, or -1 if none.
 */
export function getCurrentRound(liveData: any[]): number {
  let maxRound = -1
  for (const g of liveData) {
    const rounds: (number | null)[] = g.rounds || []
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i] !== null && i > maxRound) {
        maxRound = i
        break
      }
    }
  }
  return maxRound
}

/**
 * Build the display rounds for a cut/wd golfer based on which rounds have started.
 * - currentRound 0 or 1: only R1/R2 real data, R3/R4 stay null (cut hasn't happened yet display-wise)
 * - currentRound 2 (R3 started): show R3 = R1, R4 stays null
 * - currentRound 3 (R4 started): show R3 = R1, R4 = R2
 */
export function buildCutDisplayRounds(
  rounds: (number | null)[],
  currentRound: number
): (number | null)[] {
  const dr = [...rounds]
  if (currentRound >= 2) {
    dr[2] = dr[0] // R3 = repeat of R1
  } else {
    dr[2] = null
  }
  if (currentRound >= 3) {
    dr[3] = dr[1] // R4 = repeat of R2
  } else {
    dr[3] = null
  }
  return dr
}

export function computeStandings(liveData: any[], pickMap: Record<string, string[]>): any[] {
  const currentRound = getCurrentRound(liveData)

  const standings = PLAYERS.map((player) => {
    const playerPicks = pickMap[player] || []
    let totalScore = 0

    const golfers = playerPicks.map((name) => {
      const g: any = liveData.find(
        (d: any) => d.name.toLowerCase() === name.toLowerCase()
      ) ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active', rounds: [null,null,null,null], par: 72 }

      let adjScore = g.score ?? 0
      let displayRounds: (number | null)[]

      if (g.status === 'cut' || g.status === 'wd') {
        // Incrementally add cut penalty rounds as the weekend progresses:
        // R1/R2 only: use actual 2-round score (no penalty yet)
        // R3 started: add R3 penalty (= R1 repeated), so score * 1.5 effectively
        //   but cleaner: score + R1_to_par
        // R4 started: full double, score * 2
        const r = g.rounds || [null, null, null, null]
        const twoRoundScore = g.score ?? 0  // actual to-par after 2 rounds
        const r1Par = r[0] !== null ? r[0] - (g.par ?? 72) : 0
        if (currentRound >= 3) {
          // R4 started: full doubled score
          adjScore = twoRoundScore * 2
        } else if (currentRound >= 2) {
          // R3 started: 2-round score + R1 repeated as R3
          adjScore = twoRoundScore + r1Par
        } else {
          // R1/R2: just their real score
          adjScore = twoRoundScore
        }
        displayRounds = buildCutDisplayRounds(g.rounds || [null, null, null, null], currentRound)
      } else {
        displayRounds = [...(g.rounds || [null, null, null, null])]
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
