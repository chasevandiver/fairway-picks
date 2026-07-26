'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/scoring'
import { FOUNDING_LEAGUE_ID } from '@/lib/founding'
import { LEGACY_PLAYERS, MAJORS_HISTORY, MAJOR_COLORS, ALL_STATS } from '@/lib/constants'

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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
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

// The full generic insights block. Founding league keeps its own legacy
// score-based H2H table (rank data doesn't exist for the hardcoded era), so it
// opts out of the rank-based grid via showHeadToHead.
export function LeagueInsights({ history, golferHistory, roster, showHeadToHead = true }: {
  history: any[]
  golferHistory: any[]
  roster: string[]
  showHeadToHead?: boolean
}) {
  if (history.length === 0 || roster.length === 0) return null
  return (
    <>
      {showHeadToHead && <HeadToHeadGrid history={history} roster={roster} />}
      <MoneyOverTimeChart history={history} roster={roster} />
      <TrustyGolfers golferHistory={golferHistory} roster={roster} />
      <StreaksAndSplits history={history} roster={roster} />
    </>
  )
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────
// Stats view for custom (non-founding) leagues. Derives everything from the
// league's own history — no hardcoded baselines can leak original-league data.
export function CustomLeagueStatsView({ history, golferHistory }: { history: any[]; golferHistory: any[] }) {
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
      if (stats[h.winner_player]) stats[h.winner_player].majors++
      liveMajors.push({
        year: new Date(h.date).getFullYear(),
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Generic history-derived insights ── */}
      <LeagueInsights history={history} golferHistory={golferHistory} roster={players} />
    </div>
  )
}

export function StatsTab({ history, golferHistory, leagueId }: { history: any[]; golferHistory: any[]; leagueId: string }) {
  // Hooks must be called unconditionally; branch after.
  const [activeYear, setActiveYear] = useState<number | 'all'>('all')
  const isFoundingLeague = leagueId === FOUNDING_LEAGUE_ID
  // Custom leagues get a scoped view derived entirely from their own
  // history. The hardcoded ALL_STATS / MAJORS_HISTORY baselines below are
  // intentionally untouched — they only render for the founding league.
  if (!isFoundingLeague) return <CustomLeagueStatsView history={history} golferHistory={golferHistory} />

  // ── Merge hardcoded baseline + live Supabase results ──
  // Live results come from finalized tournaments stored in DB (2026+)
  const liveStatsByPlayer: Record<string, { first: number; second: number; third: number; winners: number; top3: number; cut: number; majors: number }> = {}
  LEGACY_PLAYERS.forEach(p => liveStatsByPlayer[p] = { first: 0, second: 0, third: 0, winners: 0, top3: 0, cut: 0, majors: 0 })

  const liveMajors: typeof MAJORS_HISTORY = []

  for (const h of history) {
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
      for (const p of LEGACY_PLAYERS) {
        if (!liveStatsByPlayer[p]) continue
        const r = (h.standings || []).find((s: any) => s.player === p)
        if (r?.has_winner) liveStatsByPlayer[p].winners++
        if (r?.has_top3 && !r?.has_winner) liveStatsByPlayer[p].top3++
      }
    }
    if (isMajor && h.winner_player) {
      const majorType = (['Masters', 'PGA Championship', 'US Open', 'The Open'] as const)
        .find(m => h.tournament_name?.includes(m)) ?? 'The Open'
      const logos: Record<string, string> = { 'Masters': '🌲', 'PGA Championship': '🏆', 'US Open': '🦅', 'The Open': '🏴󠁧󠁢󠁳󠁣󠁴󠁿' }
      liveMajors.push({
        year: new Date(h.date).getFullYear(),
        name: majorType,
        winner: h.winner_player,
        logo: logos[majorType],
      })
      liveStatsByPlayer[h.winner_player].majors++
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

  const maxCut = Math.max(...mergedStats.map(s => s.cut))

  // Major wins per player (merged)
  const majorsByPlayer: Record<string, number> = {}
  LEGACY_PLAYERS.forEach(p => majorsByPlayer[p] = 0)
  allMajors.forEach(m => {
    for (const p of LEGACY_PLAYERS) {
      if (m.winner.includes(p)) majorsByPlayer[p] += m.winner.includes('Tie') ? 0.5 : 1
    }
  })

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
                ].map((h, i) => (
                  <th key={i} className={i === 0 ? 'player-cell' : 'num-cell'} style={{ padding: '10px 20px', textAlign: i === 0 ? 'left' : 'center', fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: h.color, fontWeight: 600, whiteSpace: 'nowrap' }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mergedStats.map((s, i) => (
                <tr key={s.player} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                  <td style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="user-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{s.player[0]}</div>
                      <span style={{ fontWeight: 600 }}>{s.player}</span>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
      <LeagueInsights history={history} golferHistory={golferHistory} roster={LEGACY_PLAYERS} showHeadToHead={false} />
    </div>
  )
}
