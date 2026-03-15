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
 * A round has started if ANY active (non-cut) golfer has data for it OR is
 * currently mid-round (thru is a hole number, meaning they've teed off).
 * Returns the highest round index (0-based) that has started, or -1 if none.
 */
export function getCurrentRound(liveData: any[]): number {
  let maxRound = -1
  for (const g of liveData) {
    const rounds: (number | null)[] = g.rounds || []
    // Check completed rounds
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i] !== null && i > maxRound) {
        maxRound = i
        break
      }
    }
    // Also detect mid-round: active golfer with a numeric thru means they've
    // teed off in the next round after their last completed one.
    // This catches the start of R3/R4 before anyone has finished the round.
    if (g.status === 'active') {
      const thruNum = parseInt(g.thru ?? '')
      if (!isNaN(thruNum) && thruNum > 0) {
        let lastCompleted = -1
        for (let i = rounds.length - 1; i >= 0; i--) {
          if (rounds[i] !== null) { lastCompleted = i; break }
        }
        const inProgressRound = lastCompleted + 1
        if (inProgressRound > maxRound) maxRound = inProgressRound
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

function parsePos(p: string): number {
  if (!p || p === '—' || p === '-' || p.toUpperCase() === 'CUT' || p.toUpperCase() === 'WD') return NaN
  const n = parseInt(p.replace(/^T/i, ''))
  return n
}

export function computeStandings(liveData: any[], pickMap: Record<string, string[]>, players: string[] = PLAYERS): any[] {
  const currentRound = getCurrentRound(liveData)

  const standings = players.map((player) => {
    const playerPicks = pickMap[player] || []
    let totalScore = 0

    const golfers = playerPicks.map((name) => {
      const g: any = liveData.find(
        (d: any) => d.name.toLowerCase() === name.toLowerCase()
      ) ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active', rounds: [null,null,null,null], par: 72 }

      let adjScore = g.score ?? 0
      let displayRounds: (number | null)[]

      if (g.status === 'cut') {
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
      } else if (g.status === 'wd') {
        // WD golfers: ESPN already has the correct score from rounds played, no penalty.
        adjScore = g.score ?? 0
        displayRounds = [...(g.rounds || [null, null, null, null])]
      } else {
        displayRounds = [...(g.rounds || [null, null, null, null])]
      }

      totalScore += adjScore
      return { ...g, adjScore, displayRounds }
    })

    const hasWinner = golfers.some((g: any) => parsePos(g.position) === 1)
    const hasTop3 = golfers.some((g: any) => {
      const pos = parsePos(g.position)
      return !isNaN(pos) && pos >= 2 && pos <= 3  // position 1 is winner, not top3
    })

    // Best (lowest numeric) finishing position among this player's golfers — used as tiebreaker
    const bestPosition = golfers.reduce((best: number, g: any) => {
      const pos = parsePos(g.position)
      return !isNaN(pos) && pos < best ? pos : best
    }, Infinity)

    return { player, totalScore, golfers, hasWinner, hasTop3, bestPosition, rank: 0, moneyThisWeek: 0 }
  })

  // Primary sort: lowest totalScore wins. Tiebreaker: best (lowest) finishing position among picks.
  standings.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore
    return a.bestPosition - b.bestPosition
  })

  // Assign ranks: players tied on both totalScore and bestPosition share the same rank
  return standings.map((s, i, arr) => {
    if (i === 0) return { ...s, rank: 1 }
    const prev = arr[i - 1]
    const sameRank = s.totalScore === prev.totalScore && s.bestPosition === prev.bestPosition
    return { ...s, rank: sameRank ? prev.rank : i + 1 }
  })
}

export function computeMoney(standings: any[], players: string[] = PLAYERS): Record<string, number> {
  const money: Record<string, number> = {}
  players.forEach((p) => (money[p] = 0))
  if (!standings.length) return money

  const winner = standings[0]
  const others = players.filter((p) => p !== winner.player)
  money[winner.player] += PAYOUT_RULES.lowestStrokes * others.length
  others.forEach((p) => (money[p] -= PAYOUT_RULES.lowestStrokes))

  standings.forEach((s) => {
    if (s.hasWinner) {
      const oth = players.filter((p) => p !== s.player)
      money[s.player] += PAYOUT_RULES.outrightWinner * oth.length
      oth.forEach((p) => (money[p] -= PAYOUT_RULES.outrightWinner))
    }
  })

  standings.forEach((s) => {
    if (s.hasTop3) {
      const oth = players.filter((p) => p !== s.player)
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
