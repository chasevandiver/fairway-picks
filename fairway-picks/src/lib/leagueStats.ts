// ─── History-derived league stats ─────────────────────────────────────────────
// Pure functions over the three shapes the app already loads:
//
//   history      — one entry per finalized tournament (built in page.tsx)
//   golferHistory — golfer_results rows: per-golfer position, score, rounds
//   historyPicks  — picks rows for finished events: who took whom, and when
//
// These live in src/lib rather than inside StatsTab because vitest only picks
// up src/**/*.test.ts — anything in a .tsx can never be tested.

export type HistoryStanding = {
  player: string
  score: number
  rank: number
  has_winner?: boolean
  has_top3?: boolean
  golfers_cut?: number
}

export type HistoryEntry = {
  tournament_id?: string
  tournament_name?: string
  date?: string
  is_major?: boolean
  standings?: HistoryStanding[]
  money?: Record<string, number>
  winner_player?: string | null
}

export type GolferResult = {
  tournament_id?: string
  player_name: string
  golfer_name: string
  position?: string | null
  score?: number | null
  adj_score?: number | null
  status?: string | null
  rounds?: (number | null)[] | null
  tournaments?: { name?: string; date?: string; is_major?: boolean } | null
}

export type HistoryPick = {
  tournament_id?: string
  player_name: string
  golfer_name: string
  pick_order?: number | null
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Numeric finishing position, stripping the "T" tie prefix. Null when cut/WD. */
export function positionValue(g: Pick<GolferResult, 'position' | 'status'>): number | null {
  if (g.status === 'cut' || g.status === 'wd') return null
  const n = parseInt(String(g.position ?? '').replace(/^T/i, ''), 10)
  return Number.isNaN(n) ? null : n
}

export function isCut(g: Pick<GolferResult, 'status'>): boolean {
  return g.status === 'cut' || g.status === 'wd'
}

function mean(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((s, v) => s + v, 0) / xs.length : null
}

/** Chronological order. History arrives grouped by id, not sorted. */
export function byDate<T extends { date?: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
}

// ─── Course par ───────────────────────────────────────────────────────────────
// golfer_results stores strokes per round and a to-par total, but never the
// course par. For any golfer who completed four rounds it falls straight out:
// par = (total strokes − score) / 4. Cut golfers are excluded because their
// stored score carries the doubling penalty.

const PAR_MIN = 69
const PAR_MAX = 74

export function derivePars(golferHistory: GolferResult[]): Record<string, number> {
  const votes: Record<string, number[]> = {}
  for (const g of golferHistory) {
    const tid = g.tournament_id
    if (!tid || isCut(g)) continue
    const rounds = (g.rounds ?? []).filter((r): r is number => typeof r === 'number')
    if (rounds.length !== 4 || typeof g.score !== 'number') continue
    const par = (rounds.reduce((s, v) => s + v, 0) - g.score) / 4
    if (!Number.isInteger(par) || par < PAR_MIN || par > PAR_MAX) continue
    ;(votes[tid] ??= []).push(par)
  }
  // Most common value wins — one golfer with a bad row shouldn't set the par.
  const pars: Record<string, number> = {}
  for (const [tid, vs] of Object.entries(votes)) {
    const counts: Record<number, number> = {}
    for (const v of vs) counts[v] = (counts[v] ?? 0) + 1
    pars[tid] = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0])
  }
  return pars
}

// ─── Note 1: played and golfers picked ────────────────────────────────────────

export type AppEraCount = { played: number; picked: number; uniqueGolfers: number }

/**
 * Events entered and golfers drafted, counted only over data the app actually
 * holds. Deliberately not merged with the hardcoded ALL_STATS baseline, which
 * has no pick counts — `first + second + third` looks like an event count but
 * is a podium count.
 */
export function appEraCounts(
  history: HistoryEntry[],
  golferHistory: GolferResult[],
  players: string[],
): Record<string, AppEraCount> {
  const out: Record<string, AppEraCount> = {}
  for (const p of players) out[p] = { played: 0, picked: 0, uniqueGolfers: 0 }

  for (const h of history) {
    for (const s of h.standings ?? []) {
      if (out[s.player]) out[s.player].played++
    }
  }

  const seen: Record<string, Set<string>> = {}
  for (const g of golferHistory) {
    if (!out[g.player_name]) continue
    out[g.player_name].picked++
    ;(seen[g.player_name] ??= new Set()).add(g.golfer_name)
  }
  for (const [p, set] of Object.entries(seen)) out[p].uniqueGolfers = set.size

  return out
}

// ─── Round-derived stats ──────────────────────────────────────────────────────

export type WeekendSplit = { player: string; weekday: number; weekend: number; delta: number; events: number }

/**
 * Scoring on the weekend (R3+R4) against the first two rounds, both relative to
 * par. Negative delta means you play better once the cut has been made.
 * Only golfers who completed all four rounds count — a cut golfer has no
 * weekend to measure.
 */
export function weekendSplit(golferHistory: GolferResult[], players: string[]): WeekendSplit[] {
  const pars = derivePars(golferHistory)
  const acc: Record<string, { weekday: number[]; weekend: number[]; events: Set<string> }> = {}
  for (const p of players) acc[p] = { weekday: [], weekend: [], events: new Set() }

  for (const g of golferHistory) {
    if (!acc[g.player_name] || isCut(g)) continue
    const par = pars[g.tournament_id ?? '']
    if (!par) continue
    const r = g.rounds ?? []
    if (r.length < 4 || r.slice(0, 4).some(v => typeof v !== 'number')) continue
    const [r1, r2, r3, r4] = r as number[]
    acc[g.player_name].weekday.push(r1 + r2 - 2 * par)
    acc[g.player_name].weekend.push(r3 + r4 - 2 * par)
    if (g.tournament_id) acc[g.player_name].events.add(g.tournament_id)
  }

  return players.flatMap(p => {
    const a = acc[p]
    const weekday = mean(a.weekday)
    const weekend = mean(a.weekend)
    if (weekday === null || weekend === null) return []
    return [{ player: p, weekday, weekend, delta: weekend - weekday, events: a.events.size }]
  }).sort((a, b) => a.delta - b.delta)
}

export type SundayCharge = { player: string; finalRound: number; baseline: number; delta: number; rounds: number }

/**
 * Final-round scoring against that player's own average round. Isolates who
 * closes and who folds, without penalising anyone for drafting badly all week.
 */
export function sundayCharge(golferHistory: GolferResult[], players: string[]): SundayCharge[] {
  const pars = derivePars(golferHistory)
  const acc: Record<string, { r4: number[]; all: number[] }> = {}
  for (const p of players) acc[p] = { r4: [], all: [] }

  for (const g of golferHistory) {
    if (!acc[g.player_name] || isCut(g)) continue
    const par = pars[g.tournament_id ?? '']
    if (!par) continue
    const rounds = g.rounds ?? []
    rounds.forEach((v, i) => {
      if (typeof v !== 'number') return
      acc[g.player_name].all.push(v - par)
      if (i === 3) acc[g.player_name].r4.push(v - par)
    })
  }

  return players.flatMap(p => {
    const finalRound = mean(acc[p].r4)
    const baseline = mean(acc[p].all)
    if (finalRound === null || baseline === null) return []
    return [{ player: p, finalRound, baseline, delta: finalRound - baseline, rounds: acc[p].r4.length }]
  }).sort((a, b) => a.delta - b.delta)
}

export type ParOrBetter = { player: string; rate: number; good: number; total: number }

/** Share of a player's drafted rounds played at or under par. */
export function parOrBetterRate(golferHistory: GolferResult[], players: string[]): ParOrBetter[] {
  const pars = derivePars(golferHistory)
  const acc: Record<string, { good: number; total: number }> = {}
  for (const p of players) acc[p] = { good: 0, total: 0 }

  for (const g of golferHistory) {
    if (!acc[g.player_name]) continue
    const par = pars[g.tournament_id ?? '']
    if (!par) continue
    for (const v of g.rounds ?? []) {
      if (typeof v !== 'number') continue
      acc[g.player_name].total++
      if (v <= par) acc[g.player_name].good++
    }
  }

  return players.flatMap(p => {
    const { good, total } = acc[p]
    if (total === 0) return []
    return [{ player: p, rate: good / total, good, total }]
  }).sort((a, b) => b.rate - a.rate)
}

// ─── Pick-derived stats ───────────────────────────────────────────────────────

export type DraftSlotRow = { pickOrder: number; avgFinish: number | null; cutRate: number; wins: number; picks: number }

/**
 * Average outcome by draft slot, across the whole league. Answers whether the
 * first pick is actually worth what the snake order pays for it.
 */
export function draftSlotValue(golferHistory: GolferResult[], historyPicks: HistoryPick[]): DraftSlotRow[] {
  const orderOf = new Map<string, number>()
  for (const p of historyPicks) {
    if (typeof p.pick_order !== 'number') continue
    orderOf.set(`${p.tournament_id}|${p.player_name}|${p.golfer_name.toLowerCase()}`, p.pick_order)
  }

  const acc: Record<number, { finishes: number[]; cuts: number; wins: number; picks: number }> = {}
  for (const g of golferHistory) {
    const order = orderOf.get(`${g.tournament_id}|${g.player_name}|${g.golfer_name.toLowerCase()}`)
    if (typeof order !== 'number') continue
    const a = (acc[order] ??= { finishes: [], cuts: 0, wins: 0, picks: 0 })
    a.picks++
    if (isCut(g)) { a.cuts++; continue }
    const pos = positionValue(g)
    if (pos !== null) {
      a.finishes.push(pos)
      if (pos === 1) a.wins++
    }
  }

  return Object.entries(acc)
    .map(([order, a]) => ({
      pickOrder: Number(order),
      avgFinish: mean(a.finishes),
      cutRate: a.picks > 0 ? a.cuts / a.picks : 0,
      wins: a.wins,
      picks: a.picks,
    }))
    .sort((a, b) => a.pickOrder - b.pickOrder)
}

export type ChalkRow = { player: string; avgSlot: number; picks: number }

/**
 * Average draft slot a player's golfers were taken at. A low number means you
 * live on the favourites everyone wants; a high one means you go hunting.
 */
export function chalkVsSleeper(historyPicks: HistoryPick[], players: string[]): ChalkRow[] {
  const acc: Record<string, number[]> = {}
  for (const p of players) acc[p] = []
  for (const p of historyPicks) {
    if (!acc[p.player_name] || typeof p.pick_order !== 'number') continue
    acc[p.player_name].push(p.pick_order)
  }
  return players.flatMap(p => {
    const avg = mean(acc[p])
    return avg === null ? [] : [{ player: p, avgSlot: avg, picks: acc[p].length }]
  }).sort((a, b) => a.avgSlot - b.avgSlot)
}

// ─── History-derived stats ────────────────────────────────────────────────────

export type PerGolferMoney = { player: string; total: number; golfers: number; perGolfer: number }

/** Season money divided by golfers drafted — money per swing taken. */
export function moneyPerGolfer(
  history: HistoryEntry[],
  golferHistory: GolferResult[],
  players: string[],
): PerGolferMoney[] {
  const counts = appEraCounts(history, golferHistory, players)
  return players.flatMap(p => {
    const golfers = counts[p]?.picked ?? 0
    if (golfers === 0) return []
    const total = history.reduce((s, h) => s + (h.money?.[p] ?? 0), 0)
    return [{ player: p, total, golfers, perGolfer: total / golfers }]
  }).sort((a, b) => b.perGolfer - a.perGolfer)
}

export type Nemesis = { player: string; golfer: string; cuts: number; picks: number }

/** The golfer who has missed the most weekends on a given player's roster. */
export function nemesisGolfers(golferHistory: GolferResult[], players: string[]): Nemesis[] {
  const acc: Record<string, Record<string, { cuts: number; picks: number }>> = {}
  for (const g of golferHistory) {
    if (!players.includes(g.player_name)) continue
    const byGolfer = (acc[g.player_name] ??= {})
    const e = (byGolfer[g.golfer_name] ??= { cuts: 0, picks: 0 })
    e.picks++
    if (isCut(g)) e.cuts++
  }
  return players.flatMap(p => {
    const entries = Object.entries(acc[p] ?? {}).filter(([, e]) => e.cuts > 0)
    if (entries.length === 0) return []
    // Most cuts wins; ties break toward the golfer picked fewer times, which is
    // the more damning record.
    entries.sort((a, b) => (b[1].cuts - a[1].cuts) || (a[1].picks - b[1].picks))
    const [golfer, e] = entries[0]
    return [{ player: p, golfer, cuts: e.cuts, picks: e.picks }]
  }).sort((a, b) => b.cuts - a.cuts)
}

export type BounceBack = { player: string; wins: number; chances: number; rate: number }

/**
 * How a player does the week after losing money. "Chances" counts only losing
 * weeks that were actually followed by another event.
 */
export function bounceBack(history: HistoryEntry[], players: string[]): BounceBack[] {
  const ordered = byDate(history)
  return players.flatMap(p => {
    let wins = 0, chances = 0
    for (let i = 0; i < ordered.length - 1; i++) {
      const cur = ordered[i].money?.[p]
      const next = ordered[i + 1].money?.[p]
      if (cur === undefined || next === undefined) continue
      if (cur >= 0) continue
      chances++
      if (next > 0) wins++
    }
    return chances === 0 ? [] : [{ player: p, wins, chances, rate: wins / chances }]
  }).sort((a, b) => b.rate - a.rate)
}

export type Heartbreak = { player: string; count: number; worst: { tournament: string; margin: number } | null }

/**
 * Weeks lost by a single stroke — finished outside first with a total exactly
 * one shot off the winning score.
 */
export function heartbreakers(history: HistoryEntry[], players: string[]): Heartbreak[] {
  const acc: Record<string, { count: number; worst: { tournament: string; margin: number } | null }> = {}
  for (const p of players) acc[p] = { count: 0, worst: null }

  for (const h of history) {
    const standings = h.standings ?? []
    if (standings.length < 2) continue
    const best = Math.min(...standings.map(s => s.score))
    for (const s of standings) {
      if (!acc[s.player] || s.rank === 1) continue
      const margin = s.score - best
      if (margin === 1) {
        acc[s.player].count++
        acc[s.player].worst = { tournament: h.tournament_name ?? '—', margin }
      }
    }
  }

  return players
    .map(p => ({ player: p, count: acc[p].count, worst: acc[p].worst }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
}

export type GolferValue = { golfer: string; weeks: number; money: number; perWeek: number; drafters: string[] }

/**
 * Which golfers have been worth the most to the league. Credit for a week is
 * shared equally across the four golfers on that roster — a golfer never
 * "earns" a week alone, and pretending otherwise would flatter whoever happened
 * to sit next to a winner.
 */
export function golferValue(
  history: HistoryEntry[],
  golferHistory: GolferResult[],
  players: string[],
  limit = 10,
): GolferValue[] {
  const moneyByTournament: Record<string, Record<string, number>> = {}
  for (const h of history) {
    if (h.tournament_id) moneyByTournament[h.tournament_id] = h.money ?? {}
  }

  // Roster size per (tournament, player) so credit divides correctly even when
  // a league runs a different picks-per-player count.
  const rosterSize: Record<string, number> = {}
  for (const g of golferHistory) {
    if (!players.includes(g.player_name)) continue
    const key = `${g.tournament_id}|${g.player_name}`
    rosterSize[key] = (rosterSize[key] ?? 0) + 1
  }

  const acc: Record<string, { weeks: number; money: number; drafters: Set<string> }> = {}
  for (const g of golferHistory) {
    if (!players.includes(g.player_name)) continue
    const money = moneyByTournament[g.tournament_id ?? '']?.[g.player_name]
    if (money === undefined) continue
    const size = rosterSize[`${g.tournament_id}|${g.player_name}`] || 1
    const e = (acc[g.golfer_name] ??= { weeks: 0, money: 0, drafters: new Set() })
    e.weeks++
    e.money += money / size
    e.drafters.add(g.player_name)
  }

  return Object.entries(acc)
    .map(([golfer, e]) => ({
      golfer,
      weeks: e.weeks,
      money: e.money,
      perWeek: e.money / e.weeks,
      drafters: Array.from(e.drafters).sort(),
    }))
    .sort((a, b) => b.money - a.money)
    .slice(0, limit)
}

export type Rates = { player: string; played: number; podiumRate: number; cashRate: number }

/** Podium and cash frequency as rates, so a player who missed weeks isn't buried. */
export function playerRates(history: HistoryEntry[], players: string[]): Rates[] {
  return players.flatMap(p => {
    let played = 0, podiums = 0, cashed = 0
    for (const h of history) {
      const s = (h.standings ?? []).find(st => st.player === p)
      if (!s) continue
      played++
      if (s.rank != null && s.rank <= 3) podiums++
      if ((h.money?.[p] ?? 0) > 0) cashed++
    }
    return played === 0 ? [] : [{ player: p, played, podiumRate: podiums / played, cashRate: cashed / played }]
  }).sort((a, b) => b.cashRate - a.cashRate)
}

export type RecordEntry = { label: string; value: string; holder: string; detail: string; how: string }

/** The record book — league extremes, each with the week it happened. */
export function recordBook(history: HistoryEntry[], golferHistory: GolferResult[], players: string[]): RecordEntry[] {
  const records: RecordEntry[] = []
  if (history.length === 0) return records
  const ordered = byDate(history)

  // Lowest and highest weekly team total.
  let low: { player: string; score: number; t: string } | null = null
  let high: { player: string; score: number; t: string } | null = null
  for (const h of ordered) {
    for (const s of h.standings ?? []) {
      if (!players.includes(s.player) || typeof s.score !== 'number') continue
      const t = h.tournament_name ?? '—'
      if (!low || s.score < low.score) low = { player: s.player, score: s.score, t }
      if (!high || s.score > high.score) high = { player: s.player, score: s.score, t }
    }
  }
  const rel = (n: number) => (n > 0 ? `+${n}` : n === 0 ? 'E' : String(n))
  if (low) records.push({
    label: 'Lowest weekly total', value: rel(low.score), holder: low.player, detail: low.t,
    how: 'Best combined adjusted score by one player in a single tournament',
  })
  if (high) records.push({
    label: 'Highest weekly total', value: rel(high.score), holder: high.player, detail: high.t,
    how: 'Worst combined adjusted score by one player in a single tournament',
  })

  // Biggest margin of victory — winner against the best score behind them.
  let blowout: { player: string; margin: number; t: string } | null = null
  for (const h of ordered) {
    const standings = (h.standings ?? []).filter(s => players.includes(s.player))
    if (standings.length < 2) continue
    const sorted = [...standings].sort((a, b) => a.score - b.score)
    const margin = sorted[1].score - sorted[0].score
    if (margin > 0 && (!blowout || margin > blowout.margin)) {
      blowout = { player: sorted[0].player, margin, t: h.tournament_name ?? '—' }
    }
  }
  if (blowout) records.push({
    label: 'Biggest blowout', value: `${blowout.margin} shots`, holder: blowout.player, detail: blowout.t,
    how: 'Largest gap between the weekly winner and second place',
  })

  // Longest run of consecutive weeks won.
  let streak: { player: string; run: number } | null = null
  for (const p of players) {
    let run = 0, best = 0
    for (const h of ordered) {
      const s = (h.standings ?? []).find(st => st.player === p)
      if (!s) continue
      run = s.rank === 1 ? run + 1 : 0
      if (run > best) best = run
    }
    if (best > 1 && (!streak || best > streak.run)) streak = { player: p, run: best }
  }
  if (streak) records.push({
    label: 'Longest win streak', value: `${streak.run} weeks`, holder: streak.player, detail: 'Consecutive events',
    how: 'Most tournaments won back to back',
  })

  // Most golfers cut in a single week.
  let carnage: { player: string; cuts: number; t: string } | null = null
  for (const h of ordered) {
    for (const s of h.standings ?? []) {
      if (!players.includes(s.player)) continue
      const cuts = s.golfers_cut ?? 0
      if (cuts > 0 && (!carnage || cuts > carnage.cuts)) {
        carnage = { player: s.player, cuts, t: h.tournament_name ?? '—' }
      }
    }
  }
  if (carnage) records.push({
    label: 'Worst weekend wipeout', value: `${carnage.cuts} cut`, holder: carnage.player, detail: carnage.t,
    how: 'Most drafted golfers missing the cut in one tournament',
  })

  // Lowest single round by anyone's golfer. Sub-55 rows are feed noise.
  let round: { player: string; golfer: string; strokes: number; t: string } | null = null
  for (const g of golferHistory) {
    if (!players.includes(g.player_name)) continue
    for (const v of g.rounds ?? []) {
      if (typeof v !== 'number' || v < 55) continue
      if (!round || v < round.strokes) {
        round = { player: g.player_name, golfer: g.golfer_name, strokes: v, t: g.tournaments?.name ?? '—' }
      }
    }
  }
  if (round) records.push({
    label: 'Lowest single round', value: String(round.strokes), holder: round.player,
    detail: `${round.golfer} · ${round.t}`,
    how: 'Fewest strokes in one round by any drafted golfer',
  })

  return records
}
