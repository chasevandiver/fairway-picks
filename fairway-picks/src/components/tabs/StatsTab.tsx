'use client'

import { useState } from 'react'
import { formatMoney, parseWinnerPlayers } from '@/lib/scoring'
import { FOUNDING_LEAGUE_ID } from '@/lib/founding'
import { LEGACY_PLAYERS, HISTORICAL_PLAYERS, ALL_TIME_PLAYERS, MAJORS_HISTORY, MAJOR_COLORS, ALL_STATS } from '@/lib/constants'
import { majorKey, type MajorKey } from '@/lib/majors'
import { appEraCounts, countsTowardTallies } from '@/lib/leagueStats'
import { MoreStats } from '@/components/tabs/MoreStats'
import { SectionDesc } from '@/components/app/SectionDesc'

// ─── Generic history-derived insights (all league types) ─────────────────────
// Everything below is computed purely from (history, golferHistory, roster) —
// no hardcoded baselines — so the same components render for the founding
// league (with LEGACY_PLAYERS) and custom leagues (history-derived rosters).

const CHART_COLORS = ['#4ade80', '#f59e0b', '#60a5fa', '#f87171', '#c084fc', '#22d3ee', '#fb923c', '#a3e635']

const labelStyle: React.CSSProperties = {
  fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: 'var(--text-dim)',
}

// Head-to-head by finishing rank: a "win" is a tournament where a's rank is
// better (lower) than b's. Ties are skipped.
function HeadToHeadGrid({ history, roster }: { history: any[]; roster: string[] }) {
  if (roster.length < 2 || history.length === 0) return null
  const h2h: Record<string, Record<string, { wins: number; losses: number }>> = {}
  roster.forEach(a => {
    h2h[a] = {}
    roster.forEach(b => { if (a !== b) h2h[a][b] = { wins: 0, losses: 0 } })
  })
  for (const t of history) {
    const standings = t.standings || []
    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        const a = roster[i], b = roster[j]
        const sa = standings.find((s: any) => s.player === a)
        const sb = standings.find((s: any) => s.player === b)
        if (!sa || !sb || sa.rank == null || sb.rank == null) continue
        if (sa.rank < sb.rank) { h2h[a][b].wins++; h2h[b][a].losses++ }
        else if (sb.rank < sa.rank) { h2h[b][a].wins++; h2h[a][b].losses++ }
      }
    }
  }
  return (
    <div className="card mb-24">
      <div className="card-header"><div className="card-title">⚔️ Head-to-Head Records</div></div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        Your all-time record vs each player — a win means you finished ahead of them that week. Read across a row: green means you own that matchup.
      </SectionDesc>
      <div className="scroll-x">
        <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ ...labelStyle, padding: '10px 16px', textAlign: 'left' }}>Player</th>
              {roster.map(p => (
                <th key={p} style={{ ...labelStyle, padding: '10px 12px', textAlign: 'center' }}>{p}</th>
              ))}
              <th style={{ ...labelStyle, padding: '10px 12px', textAlign: 'center', color: 'var(--green)' }}>Overall</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((a, ai) => {
              const totalWins = roster.filter(b => b !== a).reduce((s, b) => s + h2h[a][b].wins, 0)
              const totalGames = roster.filter(b => b !== a).reduce((s, b) => s + h2h[a][b].wins + h2h[a][b].losses, 0)
              return (
                <tr key={a} style={{ borderTop: '1px solid var(--border)', background: ai % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700 }}>{a}</td>
                  {roster.map(b => {
                    if (a === b) return <td key={b} style={{ padding: '12px 12px', textAlign: 'center', background: 'var(--surface2)', color: 'var(--text-dim)' }}>—</td>
                    const rec = h2h[a][b]
                    const played = rec.wins + rec.losses
                    const color = played === 0 ? 'var(--text-dim)'
                      : rec.wins > rec.losses ? 'var(--green)'
                      : rec.wins < rec.losses ? 'var(--red)' : 'var(--text-dim)'
                    return (
                      <td key={b} style={{ padding: '12px 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, color }}>{rec.wins}-{rec.losses}</span>
                      </td>
                    )
                  })}
                  <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                      {totalWins}-{totalGames - totalWins}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Cumulative money line chart — plain inline SVG, no libraries.
function MoneyOverTimeChart({ history, roster }: { history: any[]; roster: string[] }) {
  if (history.length === 0 || roster.length === 0) return null
  const sorted = [...history].sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  // Cumulative series per player
  const series: Record<string, number[]> = {}
  roster.forEach(p => { series[p] = [] })
  const cumulative: Record<string, number> = {}
  roster.forEach(p => { cumulative[p] = 0 })
  for (const t of sorted) {
    roster.forEach(p => {
      cumulative[p] += t.money?.[p] ?? 0
      series[p].push(cumulative[p])
    })
  }

  const W = 800, H = 280, PAD_X = 16, PAD_Y = 20
  const all = roster.flatMap(p => series[p])
  const maxV = Math.max(0, ...all)
  const minV = Math.min(0, ...all)
  const range = maxV - minV || 1
  const n = sorted.length
  const x = (i: number) => n === 1 ? W / 2 : PAD_X + (i * (W - 2 * PAD_X)) / (n - 1)
  const y = (v: number) => PAD_Y + ((maxV - v) * (H - 2 * PAD_Y)) / range
  const zeroY = y(0)

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div className="card-title">📈 Money Over Time</div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>Cumulative · {n} event{n === 1 ? '' : 's'}</span>
      </div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        Cumulative season winnings after each tournament — every line is a player, and the higher it climbs, the better their season. Dips are weeks they paid out.
      </SectionDesc>
      <div className="card-body">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: 280, display: 'block' }}
          role="img"
          aria-label="Cumulative season money per player"
        >
          {/* $0 gridline */}
          <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          {roster.map((p, pi) => {
            const color = CHART_COLORS[pi % CHART_COLORS.length]
            const pts = series[p]
            if (pts.length === 0) return null
            const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
            const last = pts[pts.length - 1]
            return (
              <g key={p}>
                {pts.length > 1 && (
                  <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                )}
                <circle cx={x(pts.length - 1)} cy={y(last)} r={3.5} fill={color} />
              </g>
            )
          })}
        </svg>
        {/* Legend chips with current totals */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {roster.map((p, pi) => {
            const color = CHART_COLORS[pi % CHART_COLORS.length]
            const total = series[p][series[p].length - 1] ?? 0
            return (
              <div key={p} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 100, padding: '4px 12px',
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{p}</span>
                <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: total > 0 ? 'var(--green)' : total < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                  {formatMoney(total)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Most-picked golfer per player, with pick count and average numeric finish.
function TrustyGolfers({ golferHistory, roster }: { golferHistory: any[]; roster: string[] }) {
  const rows = roster.map(p => {
    const mine = golferHistory.filter(g => g.player_name === p)
    if (mine.length === 0) return null
    const byGolfer: Record<string, { count: number; positions: number[] }> = {}
    for (const g of mine) {
      if (!byGolfer[g.golfer_name]) byGolfer[g.golfer_name] = { count: 0, positions: [] }
      byGolfer[g.golfer_name].count++
      const pos = parseInt((g.position || '').replace(/^T/i, ''), 10)
      if (!isNaN(pos)) byGolfer[g.golfer_name].positions.push(pos)
    }
    const [golfer, info] = Object.entries(byGolfer).sort((a, b) => b[1].count - a[1].count)[0]
    const avgFinish = info.positions.length > 0
      ? info.positions.reduce((s, v) => s + v, 0) / info.positions.length
      : null
    return { player: p, golfer, count: info.count, avgFinish }
  }).filter((r): r is { player: string; golfer: string; count: number; avgFinish: number | null } => r !== null)

  if (rows.length === 0) return null
  return (
    <div className="card mb-24">
      <div className="card-header">
        <div className="card-title">🤝 Trusty Golfer</div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>Most-picked this season</span>
      </div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        The golfer each player keeps going back to, and how those picks actually finish — a low average finish means the loyalty is paying off.
      </SectionDesc>
      <div className="card-body">
        {rows.map((r, i) => (
          <div key={r.player} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{r.player}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>→</span>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--green)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.golfer}</span>
            </div>
            <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
              ×{r.count}{r.avgFinish !== null ? ` · avg finish ${r.avgFinish.toFixed(1)}` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Current cashing streak, best week, and majors-vs-regular wins per player.
function StreaksAndSplits({ history, roster }: { history: any[]; roster: string[] }) {
  if (history.length === 0 || roster.length === 0) return null
  const sorted = [...history].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  const rows = roster.map(p => {
    // Current cashing streak: consecutive most-recent tournaments with money > 0
    let streak = 0
    for (let i = sorted.length - 1; i >= 0; i--) {
      if ((sorted[i].money?.[p] ?? 0) > 0) streak++
      else break
    }
    // Best single week
    let bestWeek: number | null = null
    let majorWins = 0
    let regularWins = 0
    let played = 0
    for (const t of sorted) {
      const s = (t.standings || []).find((st: any) => st.player === p)
      if (!s) continue
      played++
      const m = t.money?.[p] ?? 0
      if (bestWeek === null || m > bestWeek) bestWeek = m
      if (s.rank === 1) {
        if (t.is_major) majorWins++
        else regularWins++
      }
    }
    return { player: p, streak, bestWeek, majorWins, regularWins, played }
  }).filter(r => r.played > 0)

  if (rows.length === 0) return null
  return (
    <div className="card mb-24">
      <div className="card-header"><div className="card-title">🔁 Streaks & Splits</div></div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        Cashing streak counts back-to-back recent weeks finishing in the money, best week is the biggest single-week haul, and the wins split shows who shows up for the majors vs the regular stops.
      </SectionDesc>
      <div className="scroll-x">
        <table className="table" style={{ minWidth: 560 }}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Cashing Streak</th>
              <th>Best Week</th>
              <th>Major Wins</th>
              <th>Regular Wins</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.player} className="row">
                <td style={{ fontWeight: 600 }}>{r.player}</td>
                <td>
                  {r.streak > 0
                    ? <span className="badge badge-green">🔥 {r.streak} week{r.streak === 1 ? '' : 's'}</span>
                    : <span style={{ color: 'var(--text-dim)', fontFamily: 'DM Mono', fontSize: 12 }}>—</span>}
                </td>
                <td>
                  <span className={`score ${r.bestWeek !== null && r.bestWeek > 0 ? 'under' : r.bestWeek !== null && r.bestWeek < 0 ? 'over' : 'even'}`} style={{ fontSize: 13 }}>
                    {r.bestWeek !== null ? formatMoney(r.bestWeek) : '—'}
                  </span>
                </td>
                <td><span style={{ fontFamily: 'DM Mono', fontSize: 13, color: '#c084fc', fontWeight: 700 }}>{r.majorWins || '—'}</span></td>
                <td><span style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>{r.regularWins || '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// One-table season summary: weeks won, podiums, average finish, and money.
function SeasonScoreboard({ history, golferHistory, roster }: { history: any[]; golferHistory: any[]; roster: string[] }) {
  const counts = appEraCounts(history, golferHistory, roster)
  if (history.length === 0 || roster.length === 0) return null
  const rows = roster.map(p => {
    let played = 0, weeksWon = 0, podiums = 0, total = 0
    const ranks: number[] = []
    for (const t of history) {
      const s = (t.standings || []).find((st: any) => st.player === p)
      if (s) {
        played++
        if (s.rank === 1) weeksWon++
        if (s.rank != null && s.rank <= 3) podiums++
        if (s.rank != null) ranks.push(s.rank)
      }
      total += t.money?.[p] ?? 0
    }
    const avgFinish = ranks.length > 0 ? ranks.reduce((s, v) => s + v, 0) / ranks.length : null
    const avgMoney = played > 0 ? total / played : null
    return { player: p, played, weeksWon, podiums, avgFinish, avgMoney, total }
  }).filter(r => r.played > 0)
    .sort((a, b) => (b.total - a.total) || (b.weeksWon - a.weeksWon))

  if (rows.length === 0) return null
  return (
    <div className="card mb-24">
      <div className="card-header">
        <div className="card-title">📋 Season Scoreboard</div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>This season</span>
      </div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        The whole season in one table — events entered, golfers drafted (distinct golfers in brackets), weeks won, top-3 finishes, average weekly finish, and dollars per week. This is where the &quot;who&apos;s actually good&quot; argument gets settled.
      </SectionDesc>
      <div className="scroll-x">
        <table className="table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Played</th>
              <th>Golfers</th>
              <th>Weeks Won</th>
              <th>Podiums</th>
              <th>Avg Finish</th>
              <th>Avg $/Week</th>
              <th>Total $</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.player} className="row">
                <td style={{ fontWeight: 600 }}>{r.player}</td>
                <td><span style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-dim)' }}>{r.played}</span></td>
                <td>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-dim)' }}>{counts[r.player]?.picked || '—'}</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', opacity: 0.7 }}> ({counts[r.player]?.uniqueGolfers ?? 0})</span>
                </td>
                <td><span style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--gold)', fontWeight: 700 }}>{r.weeksWon || '—'}</span></td>
                <td><span style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--indigo)', fontWeight: 700 }}>{r.podiums || '—'}</span></td>
                <td><span style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-dim)' }}>{r.avgFinish !== null ? r.avgFinish.toFixed(1) : '—'}</span></td>
                <td>
                  <span className={`score ${r.avgMoney !== null && r.avgMoney > 0 ? 'under' : r.avgMoney !== null && r.avgMoney < 0 ? 'over' : 'even'}`} style={{ fontSize: 13 }}>
                    {r.avgMoney !== null ? formatMoney(Math.round(r.avgMoney)) : '—'}
                  </span>
                </td>
                <td>
                  <span className={`score ${r.total > 0 ? 'under' : r.total < 0 ? 'over' : 'even'}`} style={{ fontSize: 13, fontWeight: 700 }}>
                    {formatMoney(r.total)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Closest head-to-head matchup: most evenly split W-L with ≥4 meetings
// (fallback: closest overall).
function RivalryMeter({ history, roster }: { history: any[]; roster: string[] }) {
  if (roster.length < 2 || history.length === 0) return null
  const pairs: { a: string; b: string; aWins: number; bWins: number }[] = []
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      pairs.push({ a: roster[i], b: roster[j], aWins: 0, bWins: 0 })
    }
  }
  for (const t of history) {
    const standings = t.standings || []
    for (const pair of pairs) {
      const sa = standings.find((s: any) => s.player === pair.a)
      const sb = standings.find((s: any) => s.player === pair.b)
      if (!sa || !sb || sa.rank == null || sb.rank == null) continue
      if (sa.rank < sb.rank) pair.aWins++
      else if (sb.rank < sa.rank) pair.bWins++
    }
  }
  const played = pairs.filter(p => p.aWins + p.bWins > 0)
  if (played.length === 0) return null
  const closeness = (p: typeof pairs[number]) => Math.abs(p.aWins - p.bWins)
  const eligible = played.filter(p => p.aWins + p.bWins >= 4)
  const pool = eligible.length > 0 ? eligible : played
  const rivalry = [...pool].sort((x, y) =>
    (closeness(x) - closeness(y)) || ((y.aWins + y.bWins) - (x.aWins + x.bWins))
  )[0]
  const meetings = rivalry.aWins + rivalry.bWins

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div className="card-title">🤼 Rivalry Meter</div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>{meetings} meeting{meetings === 1 ? '' : 's'}</span>
      </div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        The closest head-to-head matchup in the league — the most evenly split weekly record. These two just can&apos;t shake each other.
      </SectionDesc>
      <div className="card-body" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 16, overflowWrap: 'anywhere' }}>{rivalry.a}</span>
          <span style={{ fontFamily: 'DM Mono', fontSize: 24, fontWeight: 700, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
            {rivalry.aWins}–{rivalry.bWins}
          </span>
          <span style={{ fontWeight: 700, fontSize: 16, overflowWrap: 'anywhere' }}>{rivalry.b}</span>
        </div>
      </div>
    </div>
  )
}

// Each player's single best and single worst money week.
function BoomBust({ history, roster }: { history: any[]; roster: string[] }) {
  if (history.length === 0 || roster.length === 0) return null
  const rows = roster.map(p => {
    let best: { amount: number; tournament: string } | null = null
    let worst: { amount: number; tournament: string } | null = null
    for (const t of history) {
      const s = (t.standings || []).find((st: any) => st.player === p)
      if (!s) continue
      const m = t.money?.[p] ?? 0
      if (!best || m > best.amount) best = { amount: m, tournament: t.tournament_name || '—' }
      if (!worst || m < worst.amount) worst = { amount: m, tournament: t.tournament_name || '—' }
    }
    if (!best || !worst) return null
    return { player: p, best, worst }
  }).filter((r): r is { player: string; best: { amount: number; tournament: string }; worst: { amount: number; tournament: string } } => r !== null)
    .sort((a, b) => b.best.amount - a.best.amount)

  if (rows.length === 0) return null
  return (
    <div className="card mb-24">
      <div className="card-header"><div className="card-title">🎢 Boom / Bust</div></div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        Each player&apos;s ceiling and floor — their single best and single worst money week of the season.
      </SectionDesc>
      <div className="scroll-x">
        <table className="table" style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th>Player</th>
              <th>💥 Boom</th>
              <th>📉 Bust</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.player} className="row">
                <td style={{ fontWeight: 600 }}>{r.player}</td>
                <td>
                  <span className={`score ${r.best.amount > 0 ? 'under' : r.best.amount < 0 ? 'over' : 'even'}`} style={{ fontSize: 13, fontWeight: 700 }}>{formatMoney(r.best.amount)}</span>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{r.best.tournament.slice(0, 24)}</div>
                </td>
                <td>
                  <span className={`score ${r.worst.amount > 0 ? 'under' : r.worst.amount < 0 ? 'over' : 'even'}`} style={{ fontSize: 13, fontWeight: 700 }}>{formatMoney(r.worst.amount)}</span>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{r.worst.tournament.slice(0, 24)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Distinct golfers drafted vs total picks — field-scanners vs favorites-riders.
function LoyaltyIndex({ golferHistory, roster }: { golferHistory: any[]; roster: string[] }) {
  const rows = roster.map(p => {
    const mine = golferHistory.filter(g => g.player_name === p)
    if (mine.length === 0) return null
    const distinct = new Set(mine.map(g => g.golfer_name)).size
    return { player: p, distinct, picks: mine.length, ratio: distinct / mine.length }
  }).filter((r): r is { player: string; distinct: number; picks: number; ratio: number } => r !== null)
    .sort((a, b) => a.ratio - b.ratio)

  if (rows.length === 0) return null
  return (
    <div className="card mb-24">
      <div className="card-header">
        <div className="card-title">🧭 Loyalty Index</div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>Most loyal first</span>
      </div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        How many different golfers each player has drafted vs their total picks — a low number means they ride their favorites, a high number means they scan the whole field.
      </SectionDesc>
      <div className="card-body">
        {rows.map((r, i) => (
          <div key={r.player} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{r.player}</span>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                {r.distinct} different golfer{r.distinct === 1 ? '' : 's'} in {r.picks} pick{r.picks === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(r.ratio * 100)}%`, height: '100%', background: 'var(--indigo)', borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Share of each player's drafted golfers that were cut or withdrew.
function CutRate({ golferHistory, roster }: { golferHistory: any[]; roster: string[] }) {
  const rows = roster.map(p => {
    const mine = golferHistory.filter(g => g.player_name === p)
    if (mine.length === 0) return null
    const cuts = mine.filter(g => g.status === 'cut' || g.status === 'wd').length
    return { player: p, cuts, picks: mine.length, pct: (cuts / mine.length) * 100 }
  }).filter((r): r is { player: string; cuts: number; picks: number; pct: number } => r !== null)
    .sort((a, b) => a.pct - b.pct)

  if (rows.length === 0) return null
  return (
    <div className="card mb-24">
      <div className="card-header">
        <div className="card-title">✂️ Cut Rate</div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>Lower is better</span>
      </div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        What share of each player&apos;s drafted golfers got cut or withdrew — the smaller the bar, the fewer wasted picks.
      </SectionDesc>
      <div className="card-body">
        {rows.map((r, i) => (
          <div key={r.player} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{r.player}</span>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: r.pct > 0 ? 'var(--red)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                {r.pct.toFixed(0)}% · {r.cuts} of {r.picks}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, r.pct)}%`, height: '100%', background: 'var(--red)', borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Lowest single round (strokes) by any drafted golfer all season.
// Rounds below 55 are treated as data noise and ignored.
function BestSingleRound({ golferHistory }: { golferHistory: any[] }) {
  let best: { golfer: string; player: string; tournament: string; round: number; strokes: number } | null = null
  for (const g of golferHistory) {
    const rounds: (number | null)[] = g.rounds || []
    rounds.forEach((r, ri) => {
      if (r == null || r < 55) return
      if (!best || r < best.strokes) {
        best = {
          golfer: g.golfer_name,
          player: g.player_name,
          tournament: g.tournaments?.name || '—',
          round: ri + 1,
          strokes: r,
        }
      }
    })
  }
  if (!best) return null
  const b: { golfer: string; player: string; tournament: string; round: number; strokes: number } = best

  return (
    <div className="card mb-24">
      <div className="card-header"><div className="card-title">🔥 Best Single Round</div></div>
      <SectionDesc style={{ padding: '12px 20px 0' }}>
        The lowest single round shot by any drafted golfer all season — the hottest 18 holes anyone&apos;s pick has played.
      </SectionDesc>
      <div className="card-body" style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'DM Serif Display', fontSize: 40, lineHeight: 1, color: 'var(--green)' }}>{b.strokes}</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginTop: 8, overflowWrap: 'anywhere' }}>{b.golfer}</div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)', marginTop: 4, overflowWrap: 'anywhere' }}>
          drafted by {b.player} · R{b.round} at {b.tournament}
        </div>
      </div>
    </div>
  )
}

// The full generic insights block. Founding league keeps its own legacy
// score-based H2H table (rank data doesn't exist for the hardcoded era), so it
// opts out of the rank-based grid via showHeadToHead.
export function LeagueInsights({ history, golferHistory, historyPicks = [], roster, showHeadToHead = true }: {
  history: any[]
  golferHistory: any[]
  historyPicks?: any[]
  roster: string[]
  showHeadToHead?: boolean
}) {
  if (history.length === 0 || roster.length === 0) return null
  return (
    <>
      <SeasonScoreboard history={history} golferHistory={golferHistory} roster={roster} />
      {showHeadToHead && <HeadToHeadGrid history={history} roster={roster} />}
      <RivalryMeter history={history} roster={roster} />
      <MoneyOverTimeChart history={history} roster={roster} />
      <BoomBust history={history} roster={roster} />
      <TrustyGolfers golferHistory={golferHistory} roster={roster} />
      <LoyaltyIndex golferHistory={golferHistory} roster={roster} />
      <CutRate golferHistory={golferHistory} roster={roster} />
      <BestSingleRound golferHistory={golferHistory} />
      <StreaksAndSplits history={history} roster={roster} />
      <MoreStats history={history} golferHistory={golferHistory} historyPicks={historyPicks} roster={roster} />
    </>
  )
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────
// Stats view for custom (non-founding) leagues. Derives everything from the
// league's own history — no hardcoded baselines can leak original-league data.
export function CustomLeagueStatsView({ history, golferHistory, historyPicks }: { history: any[]; golferHistory: any[]; historyPicks: any[] }) {
  // Derive players from this league's tournament history
  const players = Array.from(new Set(
    history.flatMap(h => (h.standings || []).map((s: any) => s.player))
  )) as string[]

  if (history.length === 0 || players.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">League Stats</div>
            <div className="page-sub">Stats appear after your first finalized tournament</div>
          </div>
        </div>
        <div className="empty-state card">
          <div className="empty-icon">📊</div>
          <p>No tournaments finalized yet. Stats will populate once you wrap up your first event.</p>
        </div>
      </div>
    )
  }

  // Compute per-player stats from history only
  const stats: Record<string, { first: number; second: number; third: number; winners: number; top3: number; cut: number; majors: number; played: number }> = {}
  players.forEach(p => { stats[p] = { first: 0, second: 0, third: 0, winners: 0, top3: 0, cut: 0, majors: 0, played: 0 } })

  const liveMajors: { year: number; name: string; winner: string; tournament: string }[] = []

  for (const h of history) {
    // Money-only imports have no ranks or cut counts to tally.
    if (!countsTowardTallies(h)) continue
    const isMajor = h.is_major === true
    for (const s of (h.standings || [])) {
      const p = s.player
      if (!stats[p]) continue
      stats[p].played++
      if (s.rank === 1) stats[p].first++
      if (s.rank === 2) stats[p].second++
      if (s.rank === 3) stats[p].third++
      if (s.has_winner) stats[p].winners++
      if (s.has_top3 && !s.has_winner) stats[p].top3++
      stats[p].cut += s.golfers_cut || 0
    }
    if (isMajor && h.winner_player) {
      const winners = parseWinnerPlayers(h.winner_player)
      for (const p of winners) {
        if (stats[p]) stats[p].majors += winners.length > 1 ? 0.5 : 1
      }
      liveMajors.push({
        year: Number(String(h.date).slice(0, 4)),
        name: h.tournament_name,
        winner: h.winner_player,
        tournament: h.tournament_name,
      })
    }
  }

  const rows = players
    .map(p => ({ player: p, ...stats[p] }))
    .sort((a, b) => (b.first - a.first) || (b.winners - a.winners) || (b.top3 - a.top3))

  const maxCut = Math.max(1, ...rows.map(s => s.cut))
  const picked = appEraCounts(history, golferHistory, players)

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">League Stats</div>
          <div className="page-sub">{history.length} tournament{history.length === 1 ? '' : 's'} played this season</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Tournaments', val: history.length, color: 'var(--gold)' },
          { label: 'Players', val: players.length, color: 'var(--green)' },
          { label: 'Majors Played', val: liveMajors.length, color: '#c084fc' },
          { label: 'Total Cuts', val: rows.reduce((s, p) => s + p.cut, 0), color: 'var(--red)' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card mb-24">
        <div className="card-header">
          <div className="card-title">Player Stats</div>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>This season</span>
        </div>
        <SectionDesc style={{ padding: '12px 20px 0' }}>
          Everyone&apos;s season at a glance — weekly finishes, majors won, times they drafted the tournament winner or a top-3 golfer, and how many of their picks got cut.
        </SectionDesc>
        <div className="stats-table-wrap">
          <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {[
                  { label: 'Player', color: 'var(--text-dim)' },
                  { label: 'Played', color: 'var(--text-dim)' },
                  { label: '🥇 1st', color: 'var(--gold)' },
                  { label: '🥈 2nd', color: '#c0c0c0' },
                  { label: '🥉 3rd', color: '#cd7f32' },
                  { label: '🏆 Majors', color: '#c084fc' },
                  { label: '🎯 Winners', color: 'var(--green)' },
                  { label: '🔝 Top 3', color: 'var(--indigo)' },
                  { label: '✂️ Cuts', color: 'var(--red)' },
                  { label: '🏌️ Picked', color: 'var(--text-dim)' },
                ].map((h, i) => (
                  <th key={i} className={i === 0 ? 'player-cell' : 'num-cell'} style={{ padding: '10px 20px', textAlign: i === 0 ? 'left' : 'center', fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: h.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={s.player} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="user-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{s.player[0]}</div>
                      <span style={{ fontWeight: 600 }}>{s.player}</span>
                    </div>
                  </td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: 'var(--text-dim)' }}>{s.played}</td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: 'var(--gold)', fontWeight: 600 }}>{s.first}</td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: '#c0c0c0' }}>{s.second}</td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: '#cd7f32' }}>{s.third}</td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: '#c084fc' }}>{s.majors}</td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: 'var(--green)' }}>{s.winners}</td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: 'var(--indigo)' }}>{s.top3}</td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: 'var(--red)' }}>
                    <div style={{ display: 'inline-block', width: 80, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(s.cut / maxCut) * 100}%`, height: 6, background: 'var(--red)' }} />
                    </div>
                    <div style={{ fontSize: 10, marginTop: 2 }}>{s.cut}</div>
                  </td>
                  <td className="num-cell" style={{ padding: '14px 20px', textAlign: 'center', fontFamily: 'DM Mono', color: 'var(--text-dim)' }}>
                    {picked[s.player]?.picked || '—'}
                    <div style={{ fontSize: 10, opacity: 0.7 }}>{picked[s.player]?.uniqueGolfers ?? 0} unique</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Generic history-derived insights ── */}
      <LeagueInsights history={history} golferHistory={golferHistory} historyPicks={historyPicks} roster={players} />
    </div>
  )
}

export function StatsTab({ history, golferHistory, historyPicks, leagueId }: { history: any[]; golferHistory: any[]; historyPicks: any[]; leagueId: string }) {
  // Hooks must be called unconditionally; branch after.
  const [activeYear, setActiveYear] = useState<number | 'all'>('all')
  const isFoundingLeague = leagueId === FOUNDING_LEAGUE_ID
  // Custom leagues get a scoped view derived entirely from their own
  // history. The hardcoded ALL_STATS / MAJORS_HISTORY baselines below are
  // intentionally untouched — they only render for the founding league.
  if (!isFoundingLeague) return <CustomLeagueStatsView history={history} golferHistory={golferHistory} historyPicks={historyPicks} />

  // ── Merge hardcoded baseline + live Supabase results ──
  // Live results come from finalized tournaments stored in DB (2026+)
  const liveStatsByPlayer: Record<string, { first: number; second: number; third: number; winners: number; top3: number; cut: number; majors: number }> = {}
  ALL_TIME_PLAYERS.forEach(p => liveStatsByPlayer[p] = { first: 0, second: 0, third: 0, winners: 0, top3: 0, cut: 0, majors: 0 })

  // Played and golfers-picked exist only for the app era — the hardcoded
  // ALL_STATS baseline has no pick counts for 2020–2025, and podium counts are
  // not an event count. Kept out of `mergedStats` so they can't be summed with
  // a baseline that doesn't exist.
  const appEra = appEraCounts(history, golferHistory, LEGACY_PLAYERS)

  const liveMajors: typeof MAJORS_HISTORY = []

  for (const h of history) {
    // Imported pre-app seasons carry money but not tallies — ALL_STATS and
    // MAJORS_HISTORY already count those finishes, cuts and majors, so adding
    // them here would double every one of them.
    if (!countsTowardTallies(h)) continue
    const isMajor = h.is_major === true
    for (const s of (h.standings || [])) {
      const p = s.player
      if (!liveStatsByPlayer[p]) continue
      if (s.rank === 1) liveStatsByPlayer[p].first++
      if (s.rank === 2) liveStatsByPlayer[p].second++
      if (s.rank === 3) liveStatsByPlayer[p].third++
      liveStatsByPlayer[p].cut += s.golfers_cut || 0
    }
    if (h.money) {
      for (const p of ALL_TIME_PLAYERS) {
        if (!liveStatsByPlayer[p]) continue
        const r = (h.standings || []).find((s: any) => s.player === p)
        if (r?.has_winner) liveStatsByPlayer[p].winners++
        if (r?.has_top3 && !r?.has_winner) liveStatsByPlayer[p].top3++
      }
    }
    if (isMajor && h.winner_player) {
      // A tie writes "A/B (Tie)" — credit each named player a half, matching
      // how the hardcoded MAJORS_HISTORY tie strings are scored below. The
      // lookup is guarded: a winner outside LEGACY_PLAYERS (JHall, or any
      // future name) used to throw here and blank the whole tab.
      const winners = parseWinnerPlayers(h.winner_player)
      for (const p of winners) {
        if (liveStatsByPlayer[p]) liveStatsByPlayer[p].majors += winners.length > 1 ? 0.5 : 1
      }
      // The Majors Wall only has columns for the four majors. A league that
      // flags something else as a major still counts above, but has no cell to
      // sit in — better an absent row than one parked in the wrong column.
      const majorType = majorKey(h.tournament_name)
      if (majorType) {
        const logos: Record<MajorKey, string> = { 'Masters': '🌲', 'PGA Championship': '🏆', 'US Open': '🦅', 'The Open': '🏴󠁧󠁢󠁳󠁣󠁴󠁿' }
        liveMajors.push({
          // h.date is 'YYYY-MM-DD'; new Date() reads it as UTC midnight, so
          // getFullYear() can roll a January event back a year west of GMT.
          year: Number(String(h.date).slice(0, 4)),
          name: majorType,
          winner: h.winner_player,
          logo: logos[majorType],
        })
      }
    }
  }

  // Merge: baseline hardcoded + live
  const mergedStats = ALL_STATS.map(base => {
    const live = liveStatsByPlayer[base.player] || {}
    return {
      player: base.player,
      first:   base.first   + (live.first   || 0),
      second:  base.second  + (live.second  || 0),
      third:   base.third   + (live.third   || 0),
      majors:  base.majors  + (live.majors  || 0),
      winners: base.winners + (live.winners || 0),
      top3:    base.top3    + (live.top3    || 0),
      cut:     base.cut     + (live.cut     || 0),
    }
  })

  const allMajors = [...MAJORS_HISTORY, ...liveMajors]
  const years = Array.from(new Set([2020, 2021, 2022, 2023, 2024, 2025, ...liveMajors.map(m => m.year)])).sort()

  // maxCut and the charts below stay on the active roster — a historical-only
  // player has no cut total to scale a bar against.
  const maxCut = Math.max(...mergedStats.map(s => s.cut))

  // Major wins per player (merged)
  const majorsByPlayer: Record<string, number> = {}
  ALL_TIME_PLAYERS.forEach(p => majorsByPlayer[p] = 0)
  allMajors.forEach(m => {
    const winners = parseWinnerPlayers(m.winner)
    for (const p of winners) {
      if (p in majorsByPlayer) majorsByPlayer[p] += winners.length > 1 ? 0.5 : 1
    }
  })

  // Historical-only players get a row in the all-time table, but only for the
  // numbers we actually hold. ALL_STATS never recorded their finishes, cuts or
  // tour winners, so those stay null and render as an em dash rather than a
  // zero that would read as "played and never placed".
  const historicalRows = HISTORICAL_PLAYERS
    .filter(p => (majorsByPlayer[p] ?? 0) > 0 || (liveStatsByPlayer[p]?.first ?? 0) > 0)
    .map(p => ({
      player: p,
      first: null, second: null, third: null,
      majors: majorsByPlayer[p] ?? 0,
      winners: null, top3: null, cut: null,
      historical: true as const,
    }))

  const tableRows: {
    player: string
    first: number | null; second: number | null; third: number | null
    majors: number; winners: number | null; top3: number | null; cut: number | null
    historical?: boolean
  }[] = [...mergedStats, ...historicalRows]

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">League Stats</div>
          <div className="page-sub">All-time records since 2020</div>
        </div>
      </div>

      {/* ── Summary Stat Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Seasons Played', val: 6, color: 'var(--green)' },
          { label: 'Tournaments', val: mergedStats[0].first + mergedStats[0].second + mergedStats[0].third, color: 'var(--gold)' },
          { label: 'Majors Tracked', val: allMajors.length, color: '#c084fc' },
          { label: 'Total Cuts', val: mergedStats.reduce((s,p)=>s+p.cut,0), color: 'var(--red)' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Main Stats Table ── */}
      <div className="card mb-24">
        <div className="card-header">
          <div className="card-title">All-Time Player Stats</div>
          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>2020 – 2026 · All events</span>
        </div>
        <SectionDesc style={{ padding: '12px 20px 0' }}>
          The all-time ledger — weekly wins and podiums, majors won, times you drafted the tournament winner or a top-3 golfer, and total cuts eaten since 2020.
        </SectionDesc>
        <div className="stats-table-wrap">
          <table className="stats-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {[
                  { label: 'Player', color: 'var(--text-dim)' },
                  { label: '🥇 1st', color: 'var(--gold)' },
                  { label: '🥈 2nd', color: '#c0c0c0' },
                  { label: '🥉 3rd', color: '#cd7f32' },
                  { label: '🏆 Majors', color: '#c084fc' },
                  { label: '🎯 Winners', color: 'var(--green)' },
                  { label: '🔝 Top 3', color: 'var(--indigo)' },
                  { label: '✂️ Cuts', color: 'var(--red)' },
                  { label: '📅 Played*', color: 'var(--text-dim)' },
                  { label: '🏌️ Picked*', color: 'var(--text-dim)' },
                ].map((h, i) => (
                  <th key={i} className={i === 0 ? 'player-cell' : 'num-cell'} style={{ padding: '10px 20px', textAlign: i === 0 ? 'left' : 'center', fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: h.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((s, i) => (
                <tr key={s.player} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="user-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{s.player[0]}</div>
                      <div>
                        <span style={{ fontWeight: 600 }}>{s.player}</span>
                        {s.historical && (
                          <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)' }}>past player</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: 'var(--gold)' }}>{s.first || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: '#c0c0c0' }}>{s.second || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: '#cd7f32' }}>{s.third || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: '#c084fc' }}>{s.majors || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{s.winners || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: 'var(--indigo)' }}>{s.top3 || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: 'var(--red)' }}>{s.cut || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: 'var(--text-dim)' }}>{appEra[s.player]?.played || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: 'var(--text-dim)' }}>{appEra[s.player]?.picked || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SectionDesc style={{ padding: '0 20px 16px' }}>
          * Played and Picked cover the app era only (2026 on). The 2020–2025 baseline
          records finishes and cuts but never stored how many events each player entered
          or how many golfers they drafted, so those years are left out rather than guessed at.
          Past players are listed for the records they hold; an em dash means that number
          was never recorded for them, not that it is zero.
        </SectionDesc>
      </div>

      {/* ── Majors Wall ── */}
      <div className="card mb-24">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div className="card-title">⛳ Majors Wall</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveYear('all')}
              style={{
                padding: '4px 12px', borderRadius: 100, fontSize: 11, fontFamily: 'DM Mono', cursor: 'pointer', border: '1px solid',
                background: activeYear === 'all' ? 'var(--green-dim)' : 'var(--surface2)',
                borderColor: activeYear === 'all' ? 'rgba(74,222,128,0.3)' : 'var(--border)',
                color: activeYear === 'all' ? 'var(--green)' : 'var(--text-dim)',
              }}
            >All</button>
            {years.map(y => (
              <button
                key={y}
                onClick={() => setActiveYear(y)}
                style={{
                  padding: '4px 12px', borderRadius: 100, fontSize: 11, fontFamily: 'DM Mono', cursor: 'pointer', border: '1px solid',
                  background: activeYear === y ? 'var(--gold-dim)' : 'var(--surface2)',
                  borderColor: activeYear === y ? 'rgba(245,158,11,0.3)' : 'var(--border)',
                  color: activeYear === y ? 'var(--gold)' : 'var(--text-dim)',
                }}
              >{y}</button>
            ))}
          </div>
        </div>
        <SectionDesc style={{ padding: '12px 20px 0' }}>
          Who took home each of the four majors, year by year — the biggest weeks on the calendar. Tap a year chip to zoom in.
        </SectionDesc>
        <div className="majors-grid-wrap">
          <div className="majors-grid" style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0, overflowX: 'auto' }}>
          {/* Column headers */}
          {(['Masters', 'PGA Championship', 'US Open', 'The Open'] as const).map(majorName => {
            const s = MAJOR_COLORS[majorName]
            const isMasters = majorName === 'Masters'
            return (
              <div key={majorName} style={{
                padding: '12px 14px 16px',
                borderBottom: `2px solid ${s.border}`,
                textAlign: 'center',
                background: s.bg,
              }}>
                {isMasters ? (
                  <div style={{
                    fontFamily: "'Pinyon Script', cursive",
                    fontSize: 28,
                    color: '#f59e0b',
                    lineHeight: 1.1,
                    letterSpacing: '0.01em',
                  }}>Masters</div>
                ) : majorName === 'PGA Championship' ? (
                  <div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 18, fontWeight: 700, color: s.text, letterSpacing: '0.05em' }}>PGA</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 8, color: s.text, opacity: 0.7, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 1 }}>Championship</div>
                  </div>
                ) : majorName === 'US Open' ? (
                  <div>
                    <div style={{ fontFamily: 'DM Serif Display', fontSize: 13, fontWeight: 700, color: s.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>U.S.</div>
                    <div style={{ fontFamily: 'DM Serif Display', fontSize: 13, fontWeight: 700, color: s.text, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Open</div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontFamily: 'DM Serif Display', fontSize: 11, color: s.text, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>The</div>
                    <div style={{ fontFamily: 'DM Serif Display', fontSize: 15, fontWeight: 700, color: s.text, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Open</div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Rows by year */}
          {(activeYear === 'all' ? years : [activeYear as number]).map(year => (
            (['Masters', 'PGA Championship', 'US Open', 'The Open'] as const).map(majorName => {
              const major = allMajors.find(m => m.year === year && m.name === majorName)
              const s = MAJOR_COLORS[majorName]
              return (
                <div key={`${year}-${majorName}`} style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  borderRight: majorName !== 'The Open' ? '1px solid var(--border)' : undefined,
                  background: major ? s.bg : 'transparent',
                  minHeight: 64,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', marginBottom: 3 }}>{year}</div>
                  {major ? (
                    <div style={{ fontWeight: 700, fontSize: 13, color: s.text }}>{major.winner}</div>
                  ) : (
                    <div style={{ color: 'var(--border-bright)', fontSize: 12 }}>—</div>
                  )}
                </div>
              )
            })
          ))}
        </div>
        </div>{/* end majors-grid-wrap */}

        {/* Major wins leaderboard */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px' }}>
          <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 12 }}>Major Wins Leaderboard</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(majorsByPlayer)
              .sort((a, b) => b[1] - a[1])
              .filter(([, v]) => v > 0)
              .map(([player, count]) => (
                <div key={player} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 14px',
                }}>
                  <div className="user-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{player[0]}</div>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{player}</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 14, fontWeight: 700, color: '#c084fc', marginLeft: 4 }}>{count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* ── Podium Finishes breakdown ── */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><div className="card-title">🏅 Podium Finishes</div></div>
          <SectionDesc style={{ padding: '12px 24px 0' }}>
            All-time 1st, 2nd, and 3rd place weekly finishes stacked into one bar per player — the more gold in the bar, the more weeks they&apos;ve won.
          </SectionDesc>
          <div style={{ padding: '20px 24px' }}>
            {mergedStats.map(s => (
              <div key={s.player} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.player}</span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span title="1st" style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--gold)' }}>🥇{s.first}</span>
                    <span title="2nd" style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#c0c0c0' }}>🥈{s.second}</span>
                    <span title="3rd" style={{ fontFamily: 'DM Mono', fontSize: 12, color: '#cd7f32' }}>🥉{s.third}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                  {s.first > 0 && <div style={{ flex: s.first, background: 'var(--gold)', borderRadius: '4px 0 0 4px' }} />}
                  {s.second > 0 && <div style={{ flex: s.second, background: '#c0c0c0' }} />}
                  {s.third > 0 && <div style={{ flex: s.third, background: '#cd7f32', borderRadius: '0 4px 4px 0' }} />}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">✂️ Cuts Taken</div></div>
          <SectionDesc style={{ padding: '12px 24px 0' }}>
            How many drafted golfers missed the cut, all-time — the longer the bar, the more Fridays that ended early.
          </SectionDesc>
          <div style={{ padding: '20px 24px' }}>
            {[...mergedStats].sort((a,b) => b.cut - a.cut).map(s => (
              <div key={s.player} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.player}</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--red)' }}>{s.cut}</span>
                </div>
                <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${maxCut > 0 ? (s.cut/maxCut)*100 : 0}%`, height: '100%', background: 'var(--red)', borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Head-to-Head Records ── */}
      {history.length > 0 && (() => {
        // Build H2H: for each pair, count who finished with lower score
        const h2h: Record<string, Record<string, { wins: number; losses: number }>> = {}
        LEGACY_PLAYERS.forEach(a => {
          h2h[a] = {}
          LEGACY_PLAYERS.forEach(b => { if (a !== b) h2h[a][b] = { wins: 0, losses: 0 } })
        })

        for (const tournament of history) {
          const standings = tournament.standings || []
          for (let i = 0; i < LEGACY_PLAYERS.length; i++) {
            for (let j = i + 1; j < LEGACY_PLAYERS.length; j++) {
              const a = LEGACY_PLAYERS[i], b = LEGACY_PLAYERS[j]
              const sa = standings.find((s: any) => s.player === a)
              const sb = standings.find((s: any) => s.player === b)
              if (!sa || !sb) continue
              if (sa.score < sb.score) { h2h[a][b].wins++; h2h[b][a].losses++ }
              else if (sb.score < sa.score) { h2h[b][a].wins++; h2h[a][b].losses++ }
            }
          }
        }

        return (
          <div className="card mb-24">
            <div className="card-header"><div className="card-title">⚔️ Head-to-Head Records</div></div>
            <SectionDesc style={{ padding: '12px 20px 0' }}>
              Your all-time record vs each player — a win means you posted a lower score than them that week. Green means you own that matchup.
            </SectionDesc>
            <div className="scroll-x">
              <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Player</th>
                    {LEGACY_PLAYERS.map(p => (
                      <th key={p} style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{p}</th>
                    ))}
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {LEGACY_PLAYERS.map((a, ai) => {
                    const totalWins = LEGACY_PLAYERS.filter(b => b !== a).reduce((s, b) => s + h2h[a][b].wins, 0)
                    const totalGames = LEGACY_PLAYERS.filter(b => b !== a).reduce((s, b) => s + h2h[a][b].wins + h2h[a][b].losses, 0)
                    return (
                      <tr key={a} style={{ borderTop: '1px solid var(--border)', background: ai % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{a}</td>
                        {LEGACY_PLAYERS.map(b => {
                          if (a === b) return <td key={b} style={{ padding: '12px 12px', textAlign: 'center', background: 'var(--surface2)', color: 'var(--text-dim)' }}>—</td>
                          const rec = h2h[a][b]
                          const winPct = rec.wins + rec.losses > 0 ? rec.wins / (rec.wins + rec.losses) : 0.5
                          const color = winPct > 0.5 ? 'var(--green)' : winPct < 0.5 ? 'var(--red)' : 'var(--text-dim)'
                          return (
                            <td key={b} style={{ padding: '12px 12px', textAlign: 'center' }}>
                              <span style={{ fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, color }}>{rec.wins}-{rec.losses}</span>
                            </td>
                          )
                        })}
                        <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                          <span style={{ fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>
                            {totalWins}-{totalGames - totalWins}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* ── Rivalry Tracker ── */}
      {history.length > 1 && (() => {
        // Find closest season money races across all tournaments
        const moneyByTournament = history.map(h => ({
          name: h.tournament_name,
          date: h.date,
          money: h.money || {},
        }))

        // Running totals per tournament
        const runningTotals: Record<string, number[]> = {}
        LEGACY_PLAYERS.forEach(p => runningTotals[p] = [])
        const sortedByDate = [...moneyByTournament].sort((a, b) => a.date?.localeCompare(b.date))
        let cumulative: Record<string, number> = {}
        LEGACY_PLAYERS.forEach(p => cumulative[p] = 0)
        for (const t of sortedByDate) {
          LEGACY_PLAYERS.forEach(p => {
            cumulative[p] = (cumulative[p] || 0) + (t.money[p] || 0)
            runningTotals[p].push(cumulative[p])
          })
        }

        // Find closest pairs: smallest average gap in running totals
        const rivals: { a: string; b: string; avgGap: number; currentGap: number }[] = []
        for (let i = 0; i < LEGACY_PLAYERS.length; i++) {
          for (let j = i + 1; j < LEGACY_PLAYERS.length; j++) {
            const a = LEGACY_PLAYERS[i], b = LEGACY_PLAYERS[j]
            const gaps = runningTotals[a].map((v, k) => Math.abs(v - runningTotals[b][k]))
            const avgGap = gaps.reduce((s, v) => s + v, 0) / gaps.length
            const currentGap = Math.abs((cumulative[a] || 0) - (cumulative[b] || 0))
            rivals.push({ a, b, avgGap, currentGap })
          }
        }
        rivals.sort((x, y) => x.avgGap - y.avgGap)
        const topRivals = rivals.slice(0, 3)

        return (
          <div className="card mb-24">
            <div className="card-header">
              <div className="card-title">🔥 Rivalry Tracker</div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>Closest season money races</span>
            </div>
            <SectionDesc style={{ padding: '12px 20px 0' }}>
              The three tightest money races this season — the smaller the gap between two players week after week, the hotter the rivalry.
            </SectionDesc>
            <div className="card-body">
              {topRivals.map((r, i) => {
                const aTotal = cumulative[r.a] || 0
                const bTotal = cumulative[r.b] || 0
                const aAhead = aTotal >= bTotal
                const maxAbs = Math.max(Math.abs(aTotal), Math.abs(bTotal), 1)
                return (
                  <div key={i} style={{ marginBottom: i < topRivals.length - 1 ? 24 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: aAhead ? 'var(--green)' : 'var(--text-dim)' }}>{r.a}</span>
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>vs</span>
                        <span style={{ fontWeight: 700, color: !aAhead ? 'var(--green)' : 'var(--text-dim)' }}>{r.b}</span>
                      </div>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>
                        Gap: ${r.currentGap}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', minWidth: 36, textAlign: 'right' }}>{formatMoney(aTotal)}</span>
                      <div style={{ flex: 1, height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${((aTotal + maxAbs) / (maxAbs * 2)) * 100}%`, background: 'var(--green)', borderRadius: 4, transition: 'width 0.4s' }} />
                      </div>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', minWidth: 36 }}>{formatMoney(bTotal)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Generic history-derived insights (this season's finalized events) ──
          The legacy score-based H2H table above covers head-to-head, so the
          rank-based generic grid is skipped here. */}
      <LeagueInsights history={history} golferHistory={golferHistory} historyPicks={historyPicks} roster={LEGACY_PLAYERS} showHeadToHead={false} />
    </div>
  )
}
