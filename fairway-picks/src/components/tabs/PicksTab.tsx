'use client'

import { toRelScore, scoreClass, getCurrentRound, buildCutDisplayRounds } from '@/lib/scoring'
import type { Tournament, GolferScore, PlayerStanding } from '@/lib/types'
import { ScorecardRow } from '@/components/app/PlayerCard'

// ─── Picks Tab ────────────────────────────────────────────────────────────────
const ROUND_LABELS = ['R1', 'R2', 'R3', 'R4']

export function PicksTab({ standings, pickMap, liveData, tournament, roster }: {
  standings: PlayerStanding[]
  pickMap: Record<string, string[]>
  liveData: GolferScore[]
  tournament: Tournament | null
  roster: string[]
}) {
  if (!tournament) return <div className="empty-state card"><div className="empty-icon">📋</div><p>No active tournament.</p></div>
  if (Object.keys(pickMap).length === 0) return (
    <div className="empty-state card"><div className="empty-icon">🏌️</div><p>Draft hasn't happened yet.</p></div>
  )

  const par = liveData[0]?.par ?? 72

  // ── Compute cut line score for alerts ──
  const activeLiveGolfers = liveData.filter(g => g.status === 'active' && g.score !== null)
  let cutScore: number | null = null
  if (activeLiveGolfers.length > 20) {
    const sorted = [...activeLiveGolfers].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    cutScore = sorted[Math.floor(sorted.length * 0.65)]?.score ?? null
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Picks · {tournament.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>Par {par} · *CUT/WD rounds use avg of R1+R2</div>
      </div>

      {roster.map((player) => {
        const playerPicks = pickMap[player] || []
        const s = standings.find((x) => x.player === player)
        if (playerPicks.length === 0) return null

        // Build golfer rows — round-aware cut display logic
        const currentRound = getCurrentRound(liveData)
        const golferRows = (s?.golfers ?? playerPicks.map((name) => {
          const g = liveData.find((d) => d.name.toLowerCase() === name.toLowerCase())
            ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active' as const, rounds: [null,null,null,null], par }
          // Cut golfers lock in the full doubled display immediately (penalty is
          // final at cut time); WD golfers still phase in with the field.
          const displayRounds =
            g.status === 'cut'
              ? buildCutDisplayRounds(g.rounds ?? [null, null, null, null])
              : g.status === 'wd'
                ? buildCutDisplayRounds(g.rounds ?? [null, null, null, null], currentRound)
                : [...(g.rounds ?? [null, null, null, null])]
          return { ...g, adjScore: g.score ?? 0, displayRounds }
        })).map((g: any) => {
          // Re-apply round-aware cut logic for golfers sourced from standings
          if (g.status === 'cut') {
            return { ...g, displayRounds: buildCutDisplayRounds(g.rounds ?? [null, null, null, null]) }
          }
          if (g.status === 'wd') {
            return { ...g, displayRounds: buildCutDisplayRounds(g.rounds ?? [null, null, null, null], currentRound) }
          }
          return g
        })

        // Per-round totals across all 4 golfers
        const roundTotals: (number | null)[] = [0, 1, 2, 3].map((ri) => {
          const vals: number[] = []
          let allNull = true
          for (const g of golferRows as any[]) {
            const r = (g.displayRounds ?? g.rounds ?? [])[ri]
            if (r !== null && r !== undefined) { vals.push(Number(r)); allNull = false }
            else vals.push(0)
          }
          if (allNull) return null
          let t = 0; for (const v of vals) t += v; return t
        })
        let grandTotalStrokes = 0
        for (const v of roundTotals) { if (v !== null) grandTotalStrokes += v }
        let playedRounds = 0
        for (const v of roundTotals) { if (v !== null) playedRounds++ }

        return (
          <div key={player} className="card mb-24">
            <div className="card-header" style={{ background: 'var(--surface2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="user-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>{player[0]}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{player}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>
                    {playerPicks.length} golfers picked
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 24, fontWeight: 600 }} className={`score ${scoreClass(s?.totalScore)}`}>
                  {s ? toRelScore(s.totalScore) : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>
                  {grandTotalStrokes > 0 ? `${grandTotalStrokes} strokes` : ''}
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 18px', textAlign: 'left', fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 500 }}>
                      Golfer
                    </th>
                    {ROUND_LABELS.map((r) => (
                      <th key={r} style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 500, borderLeft: '1px solid var(--border)', minWidth: 60 }}>
                        {r}
                      </th>
                    ))}
                    <th style={{ padding: '8px 14px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 500, borderLeft: '1px solid var(--border-bright)', minWidth: 70 }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {golferRows.map((g: any) => (
                    <ScorecardRow key={g.name} g={g} par={par} />
                  ))}

                  {/* Team totals row */}
                  <tr style={{ borderTop: '2px solid var(--border-bright)', background: 'var(--surface2)' }}>
                    <td style={{ padding: '12px 18px', fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                      Combined
                    </td>
                    {roundTotals.map((rt, i) => {
                      const rtPar = rt !== null ? rt - (par * 4) : null
                      return (
                        <td key={i} style={{ padding: '12px 10px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                          <div style={{ fontFamily: 'DM Mono', fontSize: 15, fontWeight: 700 }}>
                            {rt ?? '—'}
                          </div>
                          <div className={`score ${scoreClass(rtPar)}`} style={{ fontSize: 10, marginTop: 1 }}>
                            {rtPar !== null ? toRelScore(rtPar) : ''}
                          </div>
                        </td>
                      )
                    })}
                    <td style={{ padding: '12px 14px', textAlign: 'center', borderLeft: '1px solid var(--border-bright)' }}>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 16, fontWeight: 700 }}>
                        {grandTotalStrokes > 0 ? grandTotalStrokes : '—'}
                      </div>
                      <div className={`score ${scoreClass(s?.totalScore)}`} style={{ fontSize: 10, marginTop: 1 }}>
                        {s ? toRelScore(s.totalScore) : ''}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── Per-golfer alerts ── */}
            {(() => {
              const playerAlerts: { type: 'lead' | 'top3' | 'cut'; msg: string }[] = []
              for (const g of golferRows as any[]) {
                const pos = parseInt((g.position || '').replace(/^T/i, ''))
                if (pos === 1) playerAlerts.push({ type: 'lead', msg: `🏆 ${g.name} is leading the tournament!` })
                else if (!isNaN(pos) && pos <= 3) playerAlerts.push({ type: 'top3', msg: `🔝 ${g.name} is T${pos} — top 3!` })
                if (cutScore !== null && g.status === 'active' && g.score !== null && g.thru !== 'F') {
                  const diff = (g.score ?? 0) - cutScore
                  if (diff >= 0 && diff <= 2) {
                    playerAlerts.push({ type: 'cut', msg: `✂️ ${g.name} is on the cut line (${toRelScore(g.score)})` })
                  }
                }
              }
              if (playerAlerts.length === 0) return null
              return (
                <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {playerAlerts.map((a, i) => (
                    <div key={i} className={`alert ${a.type === 'lead' ? 'alert-gold' : a.type === 'top3' ? 'alert-green' : 'alert-red'}`} style={{ margin: 0, fontSize: 12 }}>
                      {a.msg}
                    </div>
                  ))}
                </div>
              )
            })()}

            {s && (s.hasWinner || s.top3Count > 0) && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, background: 'var(--surface2)' }}>
                {s.hasWinner     && <span className="badge badge-gold">🏆 Has Tournament Winner</span>}
                {s.top3Count > 0 && <span className="badge badge-green">🔝 Has Top 3 Golfer</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
