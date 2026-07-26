'use client'

import { formatMoney, moneyClass } from '@/lib/scoring'
import type { LeagueRules } from '@/lib/rules'
import type { Tournament, SeasonMoney } from '@/lib/types'
import { AnimatedMoney } from '@/components/app/AnimatedMoney'

// ─── Money Tab ────────────────────────────────────────────────────────────────
export function MoneyTab({ seasonMoney, weekMoney, tournament, history, roster, rules }: {
  seasonMoney: SeasonMoney[]
  weekMoney: Record<string, number>
  tournament: Tournament | null
  history: any[]
  roster: string[]
  rules: LeagueRules
}) {
  const sorted = [...seasonMoney].sort((a, b) => b.total - a.total)
  // Total dollars that changed hands (sum of positive balances = what winners collected)
  const totalPot = seasonMoney.reduce((s, sm) => s + Math.max(0, sm.total), 0)
  const tournamentsPlayed = history.length

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Money</div>
      </div>

      {/* ── Total Season Pot — Liquid Glass hero card ── */}
      {(totalPot > 0 || tournamentsPlayed > 0) && (
        <div className="glass-card-gold mb-24" style={{
          padding: '28px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold)', marginBottom: 6 }}>
              💰 Season Total Pot
            </div>
            <div style={{ fontFamily: 'DM Serif Display', fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>
              ${totalPot}
            </div>
            <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              {tournamentsPlayed} tournament{tournamentsPlayed !== 1 ? 's' : ''} · total won by leaders
            </div>
          </div>
          {sorted[0] && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 4 }}>
                Season Leader
              </div>
              <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>{sorted[0].player_name}</div>
              <AnimatedMoney value={sorted[0].total} style={{ fontFamily: 'DM Serif Display', fontSize: 24, color: sorted[0].total >= 0 ? 'var(--green)' : 'var(--red)' }} />
            </div>
          )}
        </div>
      )}

      <div className="mb-24">
        <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 20, marginBottom: 16 }}>Season Totals</h3>
        <div className="money-grid">
          {sorted.map((sm, i) => {
            const v = sm.total
            const glassClass = i === 0 ? 'glass-card gradient-card-gold leader-glow' : i === 1 ? 'glass-card gradient-card-green' : i === 2 ? 'glass-card gradient-card-indigo' : 'glass-card'
            return (
              <div key={sm.player_name} className={`money-card ${glassClass}`}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{sm.player_name}
                </div>
                <AnimatedMoney value={v} className={`money-amount ${moneyClass(v)}`} />
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Season Total</div>
              </div>
            )
          })}
        </div>
      </div>

      {tournament && Object.keys(weekMoney).length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <div className="card-title">This Week · {tournament.name}</div>
            <span className="badge badge-gold">Projected</span>
          </div>
          <div className="card-body">
            <div className="money-grid mb-24">
              {roster.map((p) => {
                const v = weekMoney[p] || 0
                return (
                  <div key={p} className="money-card" style={{ background: 'var(--surface2)' }}>
                    <div style={{ fontWeight: 600 }}>{p}</div>
                    <div className={`money-amount ${moneyClass(v)}`}>{formatMoney(v)}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>This Week</div>
                  </div>
                )
              })}
            </div>
            <div className="divider" />
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono', lineHeight: 2 }}>
              🏆 Low Strokes → ${rules.scoring.weekly_winner} × {roster.length - 1} = ${rules.scoring.weekly_winner * (roster.length - 1)} max
              &nbsp;·&nbsp; 🎯 Tour Win → ${rules.scoring.outright_winner} × {roster.length - 1}
              &nbsp;·&nbsp; 🔝 Top 3 → ${rules.scoring.top3_bonus} × {roster.length - 1}
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="card">
          <div className="card-header"><div className="card-title">Tournament History</div></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Tournament</th>
                  {roster.map((p) => <th key={p}>{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {history.map((h: any, i: number) => (
                  <tr key={i} className="row">
                    <td>
                      <div style={{ fontWeight: 500 }}>{h.tournament_name}</div>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>{h.date}</div>
                    </td>
                    {roster.map((p) => {
                      const v = h.money?.[p] || 0
                      return (
                        <td key={p}>
                          <span className={`score ${v > 0 ? 'under' : v < 0 ? 'over' : 'even'}`} style={{ fontSize: 13 }}>
                            {formatMoney(v)}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
