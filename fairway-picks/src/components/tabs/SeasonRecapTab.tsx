'use client'

import { formatMoney, moneyClass } from '@/lib/scoring'
import type { SeasonMoney } from '@/lib/types'
import { FOUNDING_LEAGUE_ID } from '@/lib/founding'
import { LEGACY_PLAYERS } from '@/lib/constants'

// ─── Award card (recap-local presentational helper) ──────────────────────────
function AwardCard({ emoji, name, winner, detail }: {
  emoji: string
  name: string
  winner: string
  detail: string
}) {
  return (
    <div className="card" style={{ padding: '16px 18px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, lineHeight: 1, marginBottom: 8 }}>{emoji}</div>
      <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>{name}</div>
      <div style={{ fontFamily: 'DM Serif Display', fontSize: 22, lineHeight: 1.2, marginBottom: 4 }}>{winner}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{detail}</div>
    </div>
  )
}

// Season awards derived purely from history/golferHistory — works for both
// the founding league and custom leagues.
function computeSeasonAwards(history: any[], golferHistory: any[], players: string[]) {
  const awards: { emoji: string; name: string; winner: string; detail: string }[] = []
  if (history.length === 0 || players.length === 0) return awards

  // Season MVP — most total money across the season
  const totals: Record<string, number> = {}
  players.forEach(p => { totals[p] = 0 })
  for (const h of history) {
    players.forEach(p => { totals[p] += h.money?.[p] ?? 0 })
  }
  const mvp = players.reduce((best, p) => (totals[p] > totals[best] ? p : best), players[0])
  awards.push({
    emoji: '👑', name: 'Season MVP', winner: mvp,
    detail: `${formatMoney(totals[mvp])} total on the season`,
  })

  // Best Single Week — biggest one-tournament haul
  let bw: { player: string; tournament: string; amount: number } | null = null
  for (const h of history) {
    for (const p of players) {
      const v = h.money?.[p]
      if (v === undefined) continue
      if (!bw || v > bw.amount) bw = { player: p, tournament: h.tournament_name || '—', amount: v }
    }
  }
  if (bw) awards.push({
    emoji: '💰', name: 'Best Single Week', winner: bw.player,
    detail: `${formatMoney(bw.amount)} at ${bw.tournament}`,
  })

  // Cut Magnet — most cut/wd golfers picked
  const cutCounts: Record<string, number> = {}
  for (const g of golferHistory) {
    if (g.status === 'cut' || g.status === 'wd') {
      cutCounts[g.player_name] = (cutCounts[g.player_name] ?? 0) + 1
    }
  }
  const cutEntries = Object.entries(cutCounts).filter(([p]) => players.includes(p))
  if (cutEntries.length > 0) {
    const [cutPlayer, cuts] = cutEntries.sort((a, b) => b[1] - a[1])[0]
    awards.push({
      emoji: '✂️', name: 'Cut Magnet', winner: cutPlayer,
      detail: `${cuts} golfer${cuts === 1 ? '' : 's'} missed the weekend`,
    })
  }

  // Bargain Hunter — best single golfer finish (lowest numeric position)
  let bh: { player: string; golfer: string; tournament: string; pos: number } | null = null
  for (const g of golferHistory) {
    if (!players.includes(g.player_name)) continue
    const pos = parseInt((g.position || '').replace(/^T/i, ''), 10)
    if (isNaN(pos)) continue
    if (!bh || pos < bh.pos) {
      bh = { player: g.player_name, golfer: g.golfer_name, tournament: g.tournaments?.name || '—', pos }
    }
  }
  if (bh) awards.push({
    emoji: '🎯', name: 'Bargain Hunter', winner: bh.player,
    detail: `${bh.golfer} finished ${bh.pos === 1 ? '1st' : `#${bh.pos}`} at ${bh.tournament}`,
  })

  // Consistency Award — best average rank, min 2 tournaments played
  let ca: { player: string; avg: number; played: number } | null = null
  for (const p of players) {
    const ranks: number[] = []
    for (const h of history) {
      const s = (h.standings || []).find((st: any) => st.player === p)
      if (s && s.rank != null) ranks.push(s.rank)
    }
    if (ranks.length < 2) continue
    const avg = ranks.reduce((s, v) => s + v, 0) / ranks.length
    if (!ca || avg < ca.avg) ca = { player: p, avg, played: ranks.length }
  }
  if (ca) awards.push({
    emoji: '🧊', name: 'Consistency Award', winner: ca.player,
    detail: `Avg finish ${ca.avg.toFixed(1)} over ${ca.played} events`,
  })

  return awards
}

// ─── Season Recap Tab ─────────────────────────────────────────────────────────
export function SeasonRecapTab({ history, golferHistory, seasonMoney, leagueId }: {
  history: any[]
  golferHistory: any[]
  seasonMoney: SeasonMoney[]
  leagueId: string
}) {
  if (history.length === 0) return (
    <div className="empty-state card">
      <div className="empty-icon">🏆</div>
      <p>No tournaments finalized yet. Come back after your first tournament!</p>
    </div>
  )

  // Scope players to this league. For the founding league we keep LEGACY_PLAYERS
  // (hardcoded Eric/Max/Hayden/Andrew/Brennan/Chase) so the legacy roster is
  // preserved. For any other league we derive players from the league's own
  // history so no founding-league names or stats leak in.
  const isFoundingLeague = leagueId === FOUNDING_LEAGUE_ID
  const leaguePlayers = isFoundingLeague
    ? LEGACY_PLAYERS
    : (Array.from(new Set(
        history.flatMap(h => (h.standings || []).map((s: any) => s.player))
      )) as string[])

  const sorted = [...seasonMoney].sort((a, b) => b.total - a.total)
  const leader = sorted[0]
  const mostTournaments = history.length

  // Best single week per player
  const bestWeek: Record<string, { amount: number; tournament: string }> = {}
  const worstWeek: Record<string, { amount: number; tournament: string }> = {}
  leaguePlayers.forEach(p => {
    bestWeek[p] = { amount: -Infinity, tournament: '—' }
    worstWeek[p] = { amount: Infinity, tournament: '—' }
  })
  for (const h of history) {
    leaguePlayers.forEach(p => {
      const v = h.money?.[p] ?? 0
      if (v > bestWeek[p].amount) bestWeek[p] = { amount: v, tournament: h.tournament_name }
      if (v < worstWeek[p].amount) worstWeek[p] = { amount: v, tournament: h.tournament_name }
    })
  }

  // Pick grades: grade each golfer based on finish vs draft position
  const gradeMap: Record<string, { A: number; B: number; C: number; D: number; F: number }> = {}
  leaguePlayers.forEach(p => gradeMap[p] = { A: 0, B: 0, C: 0, D: 0, F: 0 })

  const gradePick = (draftPos: number, finishPos: number | null, status: string): 'A' | 'B' | 'C' | 'D' | 'F' => {
    if (status === 'cut' || status === 'wd') return finishPos === null || draftPos <= 2 ? 'F' : 'D'
    if (finishPos === null) return 'C'
    // Early pick (1-6) finishing top 10 = A, top 20 = B, etc.
    const expected = draftPos <= 6 ? 15 : draftPos <= 12 ? 25 : 40
    if (finishPos <= expected * 0.3) return 'A'
    if (finishPos <= expected * 0.7) return 'B'
    if (finishPos <= expected) return 'C'
    if (finishPos <= expected * 1.5) return 'D'
    return 'F'
  }

  // Build grades from golferHistory
  for (const g of golferHistory) {
    const p = g.player_name
    if (!gradeMap[p]) continue
    // Approximate draft position from pick order in that tournament
    const pos = parseInt((g.position || '').replace(/^T/, ''))
    const grade = gradePick(2, isNaN(pos) ? null : pos, g.status || 'active')
    gradeMap[p][grade]++
  }

  const gradeColor = (grade: string) => {
    if (grade === 'A') return 'var(--green)'
    if (grade === 'B') return '#60a5fa'
    if (grade === 'C') return 'var(--gold)'
    if (grade === 'D') return '#fb923c'
    return 'var(--red)'
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Season Recap</div>
          <div className="page-sub">{mostTournaments} tournament{mostTournaments !== 1 ? 's' : ''} played</div>
        </div>
      </div>

      {/* Season leader banner */}
      {leader && (
        <div className="card gradient-card-gold leader-glow" style={{
          borderRadius: 12, padding: '20px 24px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <div style={{ fontSize: 40 }}>🏆</div>
          <div>
            <div style={{ fontFamily: 'DM Serif Display', fontSize: 22 }}>
              <span style={{ color: 'var(--gold)' }}>{leader.player_name}</span> is leading the season
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--gold)', marginTop: 4 }}>
              +${leader.total} ahead of {sorted[1]?.player_name} by ${leader.total - (sorted[1]?.total || 0)}
            </div>
          </div>
        </div>
      )}

      {/* Per-player recap cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
        {sorted.map((sm, i) => {
          const p = sm.player_name
          const grades = gradeMap[p]
          const totalGraded = Object.values(grades).reduce((s, v) => s + v, 0)
          const best = bestWeek[p]
          const worst = worstWeek[p]
          const wins = history.filter(h => h.standings?.[0]?.player === p || (h.standings || []).find((s: any) => s.player === p && s.rank === 1)).length

          return (
            <div key={p} className="card">
              <div className="card-header" style={{ background: 'var(--surface2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="user-avatar">{p[0]}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{p}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>#{i + 1} season</div>
                  </div>
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 22, fontWeight: 700 }} className={moneyClass(sm.total)}>
                  {formatMoney(sm.total)}
                </div>
              </div>
              <div className="card-body">
                {/* Best/worst week */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 4 }}>Best Week</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: best.amount > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                      {best.amount === -Infinity ? '—' : formatMoney(best.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{best.tournament !== '—' ? best.tournament.slice(0, 20) : '—'}</div>
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 4 }}>Worst Week</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700, color: worst.amount < 0 ? 'var(--red)' : 'var(--text-dim)' }}>
                      {worst.amount === Infinity ? '—' : formatMoney(worst.amount)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{worst.tournament !== '—' ? worst.tournament.slice(0, 20) : '—'}</div>
                  </div>
                </div>

                {/* Pick grade breakdown */}
                {totalGraded > 0 && (
                  <div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 8 }}>Pick Grades</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['A', 'B', 'C', 'D', 'F'] as const).map(grade => (
                        grades[grade] > 0 && (
                          <div key={grade} style={{
                            flex: grades[grade], background: `${gradeColor(grade)}22`,
                            border: `1px solid ${gradeColor(grade)}44`,
                            borderRadius: 6, padding: '6px 8px', textAlign: 'center',
                          }}>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 14, fontWeight: 700, color: gradeColor(grade) }}>{grade}</div>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: gradeColor(grade), opacity: 0.8 }}>{grades[grade]}×</div>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Week by week money chart */}
      <div className="card">
        <div className="card-header"><div className="card-title">📊 Money by Tournament</div></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Tournament</th>
                {leaguePlayers.map(p => <th key={p}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...history].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((h, i) => (
                <tr key={i} className="row">
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{h.tournament_name}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)' }}>{h.date}</div>
                  </td>
                  {leaguePlayers.map(p => {
                    const v = h.money?.[p] ?? 0
                    return (
                      <td key={p}>
                        <span className={`score ${v > 0 ? 'under' : v < 0 ? 'over' : 'even'}`} style={{ fontSize: 13 }}>
                          {v !== 0 ? formatMoney(v) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {/* Season totals row */}
              <tr style={{ borderTop: '2px solid var(--border-bright)', background: 'var(--surface2)' }}>
                <td style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', fontWeight: 700 }}>Season Total</td>
                {leaguePlayers.map(p => {
                  const v = seasonMoney.find(sm => sm.player_name === p)?.total ?? 0
                  return (
                    <td key={p}>
                      <span className={`score ${v > 0 ? 'under' : v < 0 ? 'over' : 'even'}`} style={{ fontSize: 14, fontWeight: 700 }}>
                        {formatMoney(v)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Season Awards ── */}
      {(() => {
        const awards = computeSeasonAwards(history, golferHistory, leaguePlayers)
        if (awards.length === 0) return null
        return (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ fontFamily: 'DM Serif Display', fontSize: 20 }}>🏆 Season Awards</div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Screenshot & share 📸</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {awards.map(a => (
                <AwardCard key={a.name} emoji={a.emoji} name={a.name} winner={a.winner} detail={a.detail} />
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
