'use client'

import { formatMoney, moneyClass } from '@/lib/scoring'
import type { SeasonMoney } from '@/lib/types'
import { FOUNDING_LEAGUE_ID } from '@/lib/founding'
import { LEGACY_PLAYERS } from '@/lib/constants'

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
    </div>
  )
}
