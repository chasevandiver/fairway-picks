import type { Pick } from './types'
import { type LeagueRules, DEFAULT_RULES } from './rules'

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
 * Build the display rounds for a cut/wd golfer.
 * A cut golfer's penalty is final the moment they miss the cut, so by default
 * we lock in the full doubled display immediately (R3 = R1, R4 = R2).
 * An optional `currentRound` may be passed to phase the display in alongside
 * the field's progress (used for WD golfers where rounds are still meaningful):
 * - currentRound 0 or 1: only R1/R2 real data, R3/R4 stay null
 * - currentRound 2 (R3 started): show R3 = R1, R4 stays null
 * - currentRound 3+ (R4 started): show R3 = R1, R4 = R2
 */
export function buildCutDisplayRounds(
  rounds: (number | null)[],
  currentRound: number = 3
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

/**
 * Adjusted score for a cut golfer under the league's cut_handling rule.
 *
 * 'double'  — the 36-hole to-par counts twice (R3 repeats R1, R4 repeats R2).
 * 'average' — R3/R4 are filled with the average of the golfer's own R1/R2.
 *             Mathematically identical to 'double' (R1+R2+2·avg = 2·(R1+R2)),
 *             kept as an accepted spelling because the founding league's
 *             stored rules — and the UI copy — have always said "average".
 * 'none'    — no penalty; the 36-hole score stands.
 */
function cutAdjScore(twoRoundScore: number, cutHandling: LeagueRules['penalties']['cut_handling']): number {
  return cutHandling === 'none' ? twoRoundScore : twoRoundScore * 2
}

export function computeStandings(
  liveData: any[],
  pickMap: Record<string, string[]>,
  players: string[],
  rules: LeagueRules = DEFAULT_RULES
): any[] {
  const cutHandling = rules.penalties?.cut_handling ?? 'double'
  const wdHandling = rules.penalties?.wd_handling ?? 'use_actual'

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
        // The missed-cut penalty is final the moment they're cut — locked in
        // immediately rather than phased in as the field plays the weekend.
        const twoRoundScore = g.score ?? 0  // actual to-par after 2 rounds
        adjScore = cutAdjScore(twoRoundScore, cutHandling)
        displayRounds = cutHandling === 'none'
          ? [...(g.rounds || [null, null, null, null])]
          : buildCutDisplayRounds(g.rounds || [null, null, null, null])
      } else if (g.status === 'wd') {
        if (wdHandling === 'none') {
          // 'none' = no special WD treatment beyond the cut rule: a withdrawal
          // is penalized exactly like a missed cut.
          adjScore = cutAdjScore(g.score ?? 0, cutHandling)
          displayRounds = cutHandling === 'none'
            ? [...(g.rounds || [null, null, null, null])]
            : buildCutDisplayRounds(g.rounds || [null, null, null, null])
        } else {
          // 'use_actual': ESPN already has the correct score from rounds played.
          adjScore = g.score ?? 0
          displayRounds = [...(g.rounds || [null, null, null, null])]
        }
      } else {
        displayRounds = [...(g.rounds || [null, null, null, null])]
      }

      totalScore += adjScore
      return { ...g, adjScore, displayRounds }
    })

    const hasWinner = golfers.some((g: any) => parsePos(g.position) === 1)
    const top3Count = golfers.filter((g: any) => {
      const pos = parsePos(g.position)
      return !isNaN(pos) && pos >= 2 && pos <= 3  // position 1 is winner, not top3
    }).length

    // Best (lowest numeric) finishing position among this player's golfers — used as tiebreaker
    const bestPosition = golfers.reduce((best: number, g: any) => {
      const pos = parsePos(g.position)
      return !isNaN(pos) && pos < best ? pos : best
    }, Infinity)

    return { player, totalScore, golfers, hasWinner, top3Count, bestPosition, rank: 0, moneyThisWeek: 0 }
  })

  // Tiebreak comparator. bestPosition can be Infinity for both sides —
  // subtraction would yield NaN and destabilize the sort, so compare, don't
  // subtract.
  const cmpTie = (a: any, b: any): number => {
    if (rules.tiebreaker === 'most_winners') {
      const winnersA = a.hasWinner ? 1 : 0
      const winnersB = b.hasWinner ? 1 : 0
      if (winnersA !== winnersB) return winnersB - winnersA // more winners first
    }
    if (a.bestPosition === b.bestPosition) return 0
    return a.bestPosition < b.bestPosition ? -1 : 1
  }

  // Primary sort: lowest totalScore wins, then the league tiebreaker.
  standings.sort((a, b) => {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore
    return cmpTie(a, b)
  })

  // Assign ranks: players who remain tied after the tiebreaker share a rank.
  // (Note ranks are assigned onto the sorted array sequentially so a tied run
  // shares the FIRST member's rank — the old implementation read ranks from
  // the pre-assignment array and gave tied players rank 0.)
  const ranked: any[] = []
  standings.forEach((s, i) => {
    if (i === 0) {
      ranked.push({ ...s, rank: 1 })
      return
    }
    const prev = ranked[i - 1]
    const tied = s.totalScore === prev.totalScore && cmpTie(s, prev) === 0
    ranked.push({ ...s, rank: tied ? prev.rank : i + 1 })
  })
  return ranked
}

// ─── Weekly pool winner ───────────────────────────────────────────────────────
// A week can have more than one rank-1 player. History records that as
// "A/B (Tie)" — the same shape the pre-2026 hardcoded majors used — so the
// half-a-major tie scoring works for live results too.

/** Render the rank-1 player names as a single winner string, or null if none. */
export function formatWinnerPlayer(names: string[]): string | null {
  if (names.length === 0) return null
  return names.length > 1 ? `${names.join('/')} (Tie)` : names[0]
}

/** Split a winner string back into its individual players. */
export function parseWinnerPlayers(winner?: string | null): string[] {
  if (!winner) return []
  return winner
    .replace(/\s*\(tie\)\s*$/i, '')
    .split('/')
    .map(s => s.trim())
    .filter(Boolean)
}

export function computeMoney(
  standings: any[],
  players: string[],
  rules: LeagueRules = DEFAULT_RULES,
  isMajor: boolean = false
): Record<string, number> {
  const money: Record<string, number> = {}
  players.forEach((p) => (money[p] = 0))
  if (!standings.length) return money

  const mult = isMajor ? (rules.multipliers?.major ?? 1) : 1
  const weekly_winner = rules.scoring.weekly_winner * mult
  const outright_winner = rules.scoring.outright_winner * mult
  const top3_bonus = rules.scoring.top3_bonus * mult

  // Weekly winner(s): every rank-1 player splits the pot. With W winners and
  // N players, each non-winner pays weekly_winner (their normal stake) split
  // across the winners — total collected per winner stays fair on ties
  // instead of the first tied player taking everything.
  const winners = standings.filter((s) => s.rank === 1).map((s) => s.player)
  if (winners.length > 0) {
    const losers = players.filter((p) => !winners.includes(p))
    losers.forEach((p) => (money[p] -= weekly_winner))
    const pot = weekly_winner * losers.length
    winners.forEach((w) => (money[w] += pot / winners.length))
  }

  standings.forEach((s) => {
    if (s.hasWinner) {
      const oth = players.filter((p) => p !== s.player)
      money[s.player] += outright_winner * oth.length
      oth.forEach((p) => (money[p] -= outright_winner))
    }
  })

  standings.forEach((s) => {
    if (s.top3Count > 0) {
      const oth = players.filter((p) => p !== s.player)
      money[s.player] += top3_bonus * oth.length * s.top3Count
      oth.forEach((p) => (money[p] -= top3_bonus * s.top3Count))
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
