// ─── Live-tournament companion helpers ────────────────────────────────────────
// Derivations over the ESPN feed the app already polls every 120s. Nothing here
// touches the database or adds a request — it is all re-reading what's on
// screen from a different angle.

import type { GolferScore, PlayerStanding } from '@/lib/types'

// ─── Cut line ─────────────────────────────────────────────────────────────────
// The PGA Tour cuts to the top 65 and ties, so the 65th percentile of the
// active field approximates the line. This was inline in PicksTab; it lives
// here so it can be tested and shared.

export const CUT_PERCENTILE = 0.65

/** Minimum field size before a percentile estimate means anything. */
const MIN_FIELD = 20

/** Projected cut line, in strokes to par. Null when the field is too thin. */
export function projectCutLine(liveData: GolferScore[]): number | null {
  const active = liveData.filter(g => g.status === 'active' && g.score !== null)
  if (active.length <= MIN_FIELD) return null
  const sorted = [...active].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
  return sorted[Math.floor(sorted.length * CUT_PERCENTILE)]?.score ?? null
}

export type CutStatus = 'safe' | 'bubble' | 'danger' | 'cut'

export type CutWatchRow = {
  golfer: string
  player: string
  score: number | null
  cushion: number | null
  state: CutStatus
}

/** Within a stroke either way of the line is a bubble. */
const BUBBLE = 1

/**
 * Each drafted golfer's cushion against the projected line. Negative cushion
 * means they are currently outside it.
 */
export function cutWatch(
  liveData: GolferScore[],
  pickMap: Record<string, string[]>,
  cutLine: number | null,
): CutWatchRow[] {
  const owner = new Map<string, string>()
  for (const [player, golfers] of Object.entries(pickMap)) {
    for (const g of golfers) owner.set(g.toLowerCase(), player)
  }

  const rows: CutWatchRow[] = []
  for (const g of liveData) {
    const player = owner.get(g.name.toLowerCase())
    if (!player) continue
    if (g.status === 'cut' || g.status === 'wd') {
      rows.push({ golfer: g.name, player, score: g.score, cushion: null, state: 'cut' })
      continue
    }
    if (cutLine === null || g.score === null) continue
    const cushion = cutLine - g.score
    const state: CutStatus = Math.abs(cushion) <= BUBBLE ? 'bubble' : cushion > 0 ? 'safe' : 'danger'
    rows.push({ golfer: g.name, player, score: g.score, cushion, state })
  }

  // Most precarious first — that's what anyone opens this for.
  const order: Record<CutStatus, number> = { danger: 0, bubble: 1, safe: 2, cut: 3 }
  return rows.sort((a, b) => (order[a.state] - order[b.state]) || ((a.cushion ?? 0) - (b.cushion ?? 0)))
}

// ─── Holes remaining ──────────────────────────────────────────────────────────

export type HolesLeftRow = { player: string; holes: number; golfersLeft: number }

/** Holes a golfer still has in the current round. "F" is done, "—" hasn't started. */
export function holesLeftForGolfer(g: GolferScore): number {
  if (g.status === 'cut' || g.status === 'wd') return 0
  const thru = String(g.thru ?? '').trim()
  if (thru === 'F' || thru === 'F*') return 0
  const n = parseInt(thru, 10)
  if (Number.isNaN(n)) return 18   // hasn't teed off yet
  return Math.max(0, 18 - n)
}

/**
 * Holes each player's roster still has to play in the current round. Whoever
 * has the most golf left has the most room to move.
 */
export function holesLeft(
  liveData: GolferScore[],
  pickMap: Record<string, string[]>,
  roster: string[],
): HolesLeftRow[] {
  const byName = new Map(liveData.map(g => [g.name.toLowerCase(), g]))
  return roster.map(player => {
    let holes = 0, golfersLeft = 0
    for (const name of pickMap[player] ?? []) {
      const g = byName.get(name.toLowerCase())
      if (!g) continue
      const left = holesLeftForGolfer(g)
      holes += left
      if (left > 0) golfersLeft++
    }
    return { player, holes, golfersLeft }
  }).sort((a, b) => b.holes - a.holes)
}

// ─── Head to head ─────────────────────────────────────────────────────────────

export type HeadToHeadRow = { opponent: string; margin: number }

/**
 * Signed stroke margin against every other player. Negative means you are
 * ahead — golf scoring, kept consistent with the rest of the app.
 */
export function liveHeadToHead(standings: PlayerStanding[], player: string): HeadToHeadRow[] {
  const me = standings.find(s => s.player === player)
  if (!me) return []
  return standings
    .filter(s => s.player !== player)
    .map(s => ({ opponent: s.player, margin: me.totalScore - s.totalScore }))
    .sort((a, b) => a.margin - b.margin)
}

// ─── Sweat meter ──────────────────────────────────────────────────────────────

export type Swing = { golfer: string; player: string; swing: number }

/**
 * Which single golfer is moving the most money right now. Re-scores the week
 * with one golfer's total nudged either way and diffs the payouts — the golfer
 * whose movement changes the most dollars across the whole league is the one
 * everyone is actually watching.
 *
 * `rescore` re-runs the caller's money engine with one golfer's score shifted,
 * which keeps this file free of rules and scoring imports.
 */
export function sweatMeter(
  pickMap: Record<string, string[]>,
  baseline: Record<string, number>,
  rescore: (golfer: string, delta: number) => Record<string, number>,
  shift = 2,
): Swing | null {
  const owner = new Map<string, string>()
  for (const [player, golfers] of Object.entries(pickMap)) {
    for (const g of golfers) owner.set(g, player)
  }

  let best: Swing | null = null
  for (const [golfer, player] of Array.from(owner.entries())) {
    const up = rescore(golfer, -shift)
    const down = rescore(golfer, shift)
    // Total dollars that move across the league between the two scenarios.
    let swing = 0
    for (const p of Object.keys(baseline)) {
      swing += Math.abs((up[p] ?? 0) - (down[p] ?? 0))
    }
    swing /= 2   // every dollar is counted twice — once leaving, once arriving
    if (swing > 0 && (!best || swing > best.swing)) best = { golfer, player, swing }
  }
  return best
}
