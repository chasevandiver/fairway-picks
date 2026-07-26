'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  toRelScore, scoreClass, formatMoney, moneyClass,
  buildPickMap, computeStandings, computeMoney, snakeDraftOrder,
  getCurrentRound, buildCutDisplayRounds
} from '@/lib/scoring'
import { DEFAULT_RULES, mergeRules } from '@/lib/rules'
import type { LeagueRules } from '@/lib/rules'
import type { Tournament, Pick, GolferScore, PlayerStanding, SeasonMoney } from '@/lib/types'
import { FOUNDING_LEAGUE_ID } from '@/lib/founding'
import { getLeagueRoster, type LeagueMember } from '@/lib/roster'
import LandingPage from '@/components/Landing'
import { LEGACY_PLAYERS, PGA_SCHEDULE, MAJORS_HISTORY, MAJOR_COLORS, ALL_STATS } from '@/lib/constants'
import { SkeletonScreen } from '@/components/app/SkeletonScreen'
import { AnimatedMoney } from '@/components/app/AnimatedMoney'
import { SetupProfileScreen } from '@/components/app/SetupProfileScreen'
import { ClaimPlayerModal } from '@/components/app/ClaimPlayerModal'
import { Sidebar } from '@/components/app/Sidebar'
import { ExpandablePlayerCard, ScorecardRow } from '@/components/app/PlayerCard'

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────
function LeaderboardTab({
  tournament, standings, liveData, pickMap, loading, lastUpdated, onRefresh, money, flashMap, roster
}: {
  tournament: Tournament | null
  standings: PlayerStanding[]
  roster: string[]
  liveData: GolferScore[]
  pickMap: Record<string, string[]>
  loading: boolean
  lastUpdated: Date | null
  onRefresh: () => void
  money: Record<string, number>
  flashMap: Record<string, 'up' | 'down'>
}) {
  const safeData = Array.isArray(liveData) ? liveData : []
  const par = safeData[0]?.par ?? 72

  if (!tournament) return (
    <div className="empty-state card">
      <div className="empty-icon">⛳</div>
      <p>No active tournament. Ask your admin to set one up.</p>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{tournament.name}</div>
          <div className="page-sub">{tournament.course} · {tournament.date} · Par {par}</div>
        </div>
        <div className="flex gap-12" style={{ alignItems: 'center' }}>
          {lastUpdated && (
            <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
            <span className={loading ? 'spin' : ''}>↻</span>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ── Tournament Progress Bar ── */}
      {(() => {
        const allFinished = liveData.length > 0 && liveData.filter(g => g.status === 'active').every(g => g.thru === 'F')
        // Use getCurrentRound (0-based) which detects mid-round golfers via numeric thru,
        // so R3 shows as active as soon as the first group tees off — not only after someone finishes.
        const currentRoundIdx = getCurrentRound(liveData)  // 0-based: 0=R1, 1=R2, 2=R3, 3=R4
        const currentRound = currentRoundIdx >= 0 ? currentRoundIdx + 1 : 1
        const steps = [
          { label: 'Round 1', short: 'R1' },
          { label: 'Round 2', short: 'R2' },
          { label: 'Round 3', short: 'R3' },
          { label: 'Round 4', short: 'R4' },
        ]
        if (liveData.length === 0) return null
        return (
          <div className="tournament-progress mb-24">
            {steps.map((s, i) => {
              const stepNum = i + 1
              const isDone = stepNum < currentRound || (allFinished && stepNum <= currentRound)
              const isActive = stepNum === currentRound && !allFinished
              const isFinal = allFinished && stepNum === 4
              return (
                <div key={i} className={`progress-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${isFinal ? 'done' : ''}`}>
                  {isActive && <div className="progress-dot" />}
                  {isDone || isFinal ? '✓ ' : ''}{s.label}
                </div>
              )
            })}
          </div>
        )
      })()}

      <div className="stats-row mb-24">
        <div className="stat-box">
          <div className="stat-val">{roster.length}</div>
          <div className="stat-label">Players</div>
        </div>
        <div className="stat-box">
          <div className="stat-val">{Object.values(pickMap).flat().length}</div>
          <div className="stat-label">Golfers</div>
        </div>
        <div className="stat-box">
          <div className="stat-val" style={{ color: 'var(--gold)', fontSize: 18 }}>
            {standings[0]?.player || '—'}
          </div>
          <div className="stat-label">Current Leader</div>
        </div>
        <div className="stat-box">
          <div className="stat-val" style={{ color: 'var(--gold)', fontSize: 18 }}>
            {liveData[0]?.name?.split(' ').pop() || '—'}
          </div>
          <div className="stat-label">Tour Leader</div>
        </div>
      </div>

      {/* ── Expandable Player Standings ── */}
      {standings.length === 0 ? (
        <div className="alert alert-gold mb-24">
          ⚡ Scores loading or draft hasn't happened yet. Go to the Draft tab to make picks.
        </div>
      ) : (
        <div className="card mb-24">
          <div className="card-header">
            <div className="card-title">Player Standings</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>
              Click to expand
            </div>
          </div>
          <div className="card-body">
            {standings.map((s) => (
              <ExpandablePlayerCard key={s.player} standing={s} liveData={safeData} par={par} pickOrder={pickMap[s.player] || []} />
            ))}
          </div>
        </div>
      )}

      {liveData.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">Tour Leaderboard</div>
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <div className="live-dot" />
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>ESPN · Live</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Golfer</th>
                <th>Total</th>
                <th>Today</th>
                <th>Thru</th>
                <th>Picked By</th>
              </tr>
            </thead>
            <tbody>
              {liveData.map((g, i) => {
                const pickedBy = Object.keys(pickMap).find((p) =>
                  (pickMap[p] || []).some((n) => n.toLowerCase() === g.name.toLowerCase())
                )
                return (
                  <tr key={i} className="row">
                    <td><span className="rank">{g.position}</span></td>
                    <td>
                      <span style={{ fontWeight: 500 }}>{g.name}</span>
                      {g.status === 'cut' && <span className="badge badge-red" style={{ marginLeft: 8 }}>CUT</span>}
                      {g.status === 'wd'  && <span className="badge badge-gray" style={{ marginLeft: 8 }}>WD</span>}
                    </td>
                    <td><span className={`score ${scoreClass(g.score)} ${flashMap[g.name] === "up" ? "score-flash-up" : flashMap[g.name] === "down" ? "score-flash-down" : ""}`}>{toRelScore(g.score)}</span></td>
                    <td><span className={`score ${scoreClass(g.today)}`}>{toRelScore(g.today)}</span></td>
                    <td><span style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-dim)' }}>{g.thru}</span></td>
                    <td>
                      {pickedBy
                        ? <span className="badge badge-green">{pickedBy}</span>
                        : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Picks Tab ────────────────────────────────────────────────────────────────
const ROUND_LABELS = ['R1', 'R2', 'R3', 'R4']

function PicksTab({ standings, pickMap, liveData, tournament, roster }: {
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

// ─── Money Tab ────────────────────────────────────────────────────────────────
function MoneyTab({ seasonMoney, weekMoney, tournament, history, roster, rules }: {
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

// ─── Draft Tab ────────────────────────────────────────────────────────────────
function DraftTab({
  tournament, picks, liveData, currentPlayer, isAdmin, onPickMade, picksPerPlayer
}: {
  tournament: Tournament | null
  picks: Pick[]
  liveData: GolferScore[]
  currentPlayer: string
  isAdmin: boolean
  onPickMade: (golferName: string, playerName: string) => Promise<void>
  picksPerPlayer: number
}) {
  const [search, setSearch] = useState('')
  const [draftOrder, setDraftOrder] = useState<{ player: string; pick: number; round: number }[]>([])
  const [saving, setSaving] = useState(false)

  const takenGolfers = picks.map((p) => p.golfer_name.toLowerCase())
  const pickMap = buildPickMap(picks)
  const draftParticipants = tournament?.draft_order ?? []
  const totalPicks = draftParticipants.length * picksPerPlayer
  const pickIndex = picks.length
  const isDraftComplete = totalPicks > 0 && picks.length >= totalPicks
  const currentPickPlayer = draftOrder[pickIndex]?.player

  useEffect(() => {
    if (tournament?.draft_order?.length) {
      setDraftOrder(snakeDraftOrder(tournament.draft_order, picksPerPlayer))
    }
  }, [tournament, picksPerPlayer])

  const isMyTurn = currentPickPlayer === currentPlayer || isAdmin

  const filteredGolfers = liveData.filter(
    (g) => !takenGolfers.includes(g.name.toLowerCase()) &&
      g.name.toLowerCase().includes(search.toLowerCase())
  )

  const handlePick = async (name: string) => {
    if (!currentPickPlayer) return
    setSaving(true)
    await onPickMade(name, currentPickPlayer)
    setSearch('')
    setSaving(false)
  }

  if (!tournament) return (
    <div className="empty-state card"><div className="empty-icon">📋</div><p>No active tournament. Admin needs to set one up.</p></div>
  )

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Snake Draft</div>
        <div style={{ fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text-dim)' }}>
          {tournament.name}
        </div>
      </div>

      <div className="grid-2">
        <div>
          {isDraftComplete ? (
            <div className="alert alert-green mb-24">✅ Draft complete! All picks have been made.</div>
          ) : (
            <div className="card mb-24">
              <div className="card-header">
                <div className="card-title">
                  {currentPickPlayer ? `${currentPickPlayer}'s Pick` : 'Draft Order'}
                </div>
                <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>
                  Pick {pickIndex + 1} / {totalPicks}
                </span>
              </div>
              <div className="card-body">
                <div className="draft-picks-flow mb-24">
                  {draftOrder.map((o, i) => (
                    <div
                      key={i}
                      className={`draft-chip ${i === pickIndex ? 'active' : i < pickIndex ? 'done' : ''}`}
                    >
                      {o.player}
                    </div>
                  ))}
                </div>

                {!isMyTurn && (
                  <div className="alert alert-gold" style={{ marginBottom: 16 }}>
                    ⏳ Waiting for <strong>{currentPickPlayer}</strong> to pick…
                  </div>
                )}

                {(isMyTurn) && (
                  <>
                    {!isAdmin && (
                      <div className="alert alert-green" style={{ marginBottom: 16 }}>
                        🎯 It's your turn, {currentPlayer}! Pick a golfer.
                      </div>
                    )}
                    {isAdmin && (
                      <div className="alert alert-gold" style={{ marginBottom: 16 }}>
                        ⚙️ Admin mode — picking on behalf of <strong>{currentPickPlayer}</strong>
                      </div>
                    )}
                    <input
                      className="form-input"
                      placeholder="Search golfers…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      style={{ marginBottom: 12 }}
                    />
                    <div className="golfer-list">
                      {liveData.length === 0 && (
                        <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 13 }}>
                          Loading golfer list…
                        </div>
                      )}
                      {filteredGolfers.slice(0, 50).map((g) => (
                        <div
                          key={g.name}
                          className="golfer-option"
                          onClick={() => !saving && handlePick(g.name)}
                        >
                          <div>
                            <div style={{ fontWeight: 500 }}>{g.name}</div>
                            <div className="golfer-meta">#{g.position} · {toRelScore(g.score)}</div>
                          </div>
                          <span className="badge badge-green">Pick</span>
                        </div>
                      ))}
                      {search && !filteredGolfers.find((g) => g.name.toLowerCase() === search.toLowerCase()) && (
                        <div className="golfer-option" onClick={() => !saving && handlePick(search)}>
                          <div>
                            <div style={{ fontWeight: 500 }}>{search}</div>
                            <div className="golfer-meta">Custom entry</div>
                          </div>
                          <span className="badge badge-gold">+ Add</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Current Picks</div></div>
          <div className="card-body">
            {draftParticipants.map((player) => {
              const playerPicks = pickMap[player] || []
              return (
                <div key={player} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {player}
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>
                      {playerPicks.length}/{picksPerPlayer}
                    </span>
                  </div>
                  {playerPicks.length === 0 ? (
                    <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No picks yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {playerPicks.map((g) => (
                        <span key={g} className="badge badge-gray">{g}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Admin Tab ────────────────────────────────────────────────────────────────
function AdminTab({
  tournament, standings, weekMoney, picks, liveData,
  leagueId, inviteCode, leagueRules, roster,
  onSetupTournament, onFinalize, onClearTournament, onClearPicks, onSwapGolfer, onSaveRules, onSaveInviteCode
}: {
  tournament: Tournament | null
  standings: PlayerStanding[]
  weekMoney: Record<string, number>
  picks: Pick[]
  liveData: GolferScore[]
  leagueId: string
  inviteCode: string
  leagueRules: LeagueRules
  roster: string[]
  onSetupTournament: (data: { name: string; course: string; date: string; draft_order: string[]; is_major: boolean }) => Promise<void>
  onFinalize: () => Promise<void>
  onClearTournament: () => Promise<void>
  onClearPicks: () => Promise<void>
  onSwapGolfer: (pickId: string, newGolferName: string) => Promise<void>
  onSaveRules: (rules: Partial<LeagueRules>) => Promise<void>
  onSaveInviteCode: (code: string) => Promise<void>
}) {
  const [selectedEvent, setSelectedEvent] = useState('')
  const [participants, setParticipants] = useState<string[]>(roster)
  const [isMajor, setIsMajor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [msg, setMsg] = useState('')
  const [copiedField, setCopiedField] = useState<'invite' | 'id' | 'publicLink' | null>(null)
  // Rules editor state — initialized from leagueRules
  const [rWeeklyWinner, setRWeeklyWinner] = useState(leagueRules.scoring.weekly_winner)
  const [rOutrightWinner, setROutrightWinner] = useState(leagueRules.scoring.outright_winner)
  const [rTop3, setRTop3] = useState(leagueRules.scoring.top3_bonus)
  const [rPicksPerPlayer, setRPicksPerPlayer] = useState(leagueRules.picks_per_player)
  const [savingRules, setSavingRules] = useState(false)
  const [codeInput, setCodeInput] = useState(inviteCode)
  const [savingCode, setSavingCode] = useState(false)
  const [editingCode, setEditingCode] = useState(!inviteCode)

  const handleSaveCode = async () => {
    if (!codeInput.trim()) return
    setSavingCode(true)
    await onSaveInviteCode(codeInput)
    setEditingCode(false)
    setSavingCode(false)
    setMsg('✅ Invite code saved!')
    setTimeout(() => setMsg(''), 3000)
  }

  const copyToClipboard = (text: string, field: 'invite' | 'id') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const handleSaveRules = async () => {
    setSavingRules(true)
    await onSaveRules({
      picks_per_player: rPicksPerPlayer,
      scoring: { weekly_winner: rWeeklyWinner, outright_winner: rOutrightWinner, top3_bonus: rTop3 },
    })
    setMsg('✅ Rules saved!')
    setSavingRules(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const moveParticipantUp = (i: number) => {
    if (i === 0) return
    setParticipants(prev => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }
  const moveParticipantDown = (i: number) => {
    setParticipants(prev => {
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  // Golfer swap state
  const [swapPlayer, setSwapPlayer] = useState<string>('')
  const [swapPickId, setSwapPickId] = useState<string | null>(null)
  const [swapPickGolfer, setSwapPickGolfer] = useState<string>('')
  const [swapSearch, setSwapSearch] = useState('')
  const [swapping, setSwapping] = useState(false)

  const selectedTournament = PGA_SCHEDULE.find((e) => e.name === selectedEvent)

  // Auto-detect majors when tournament is selected
  const MAJOR_NAMES = ['Masters', 'PGA Championship', 'U.S. Open', 'The Open Championship', 'US Open']
  useEffect(() => {
    if (selectedTournament) {
      setIsMajor(MAJOR_NAMES.some(m => selectedTournament.name.includes(m)))
    }
  }, [selectedTournament?.name])

  const toggleParticipant = (p: string) => {
    setParticipants(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const handleSetup = async () => {
    if (!selectedTournament) return
    setSaving(true)
    await onSetupTournament({ ...selectedTournament, draft_order: participants, is_major: isMajor })
    setSelectedEvent('')
    setIsMajor(false)
    setMsg('✅ Tournament activated!')
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const handleFinalize = async () => {
    setFinalizing(true)
    await onFinalize()
    setMsg('✅ Results recorded & season money updated!')
    setFinalizing(false)
    setTimeout(() => setMsg(''), 4000)
  }

  // Group schedule into upcoming vs past
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = PGA_SCHEDULE.filter((e) => e.date >= today)
  const past = PGA_SCHEDULE.filter((e) => e.date < today)

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Admin</div>
      </div>

      {msg && <div className="alert alert-green mb-24">{msg}</div>}

      {/* ── League Info ── */}
      <div className="card mb-24">
        <div className="card-header"><div className="card-title">League Info</div></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 4 }}>Invite Code</div>
                {editingCode ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={codeInput}
                      onChange={e => setCodeInput(e.target.value.toUpperCase())}
                      placeholder="e.g. EAGLE1"
                      style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '8px 12px', color: 'var(--text)', fontSize: 18, fontFamily: 'DM Mono',
                        letterSpacing: '0.15em', outline: 'none', width: 160,
                      }}
                    />
                    <button className="btn btn-green btn-sm" onClick={handleSaveCode} disabled={savingCode || !codeInput.trim()}>
                      {savingCode ? 'Saving…' : 'Save'}
                    </button>
                    {inviteCode && (
                      <button className="btn btn-outline btn-sm" onClick={() => { setCodeInput(inviteCode); setEditingCode(false) }}>
                        Cancel
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 22, fontWeight: 700, color: 'var(--green)', letterSpacing: '0.12em' }}>
                      {inviteCode || '—'}
                    </div>
                    <button className="btn btn-outline btn-sm" onClick={() => setEditingCode(true)} style={{ fontSize: 11 }}>
                      Edit
                    </button>
                  </div>
                )}
              </div>
              {!editingCode && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => inviteCode && copyToClipboard(inviteCode, 'invite')}
                  disabled={!inviteCode}
                >
                  {copiedField === 'invite' ? '✓ Copied!' : '📋 Copy Code'}
                </button>
              )}
            </div>
            <div className="divider" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 4 }}>League ID</div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-mid)', wordBreak: 'break-all' }}>
                  {leagueId}
                </div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => copyToClipboard(leagueId, 'id')}
              >
                {copiedField === 'id' ? '✓ Copied!' : '📋 Copy ID'}
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              Share the <strong style={{ color: 'var(--text)' }}>Invite Code</strong> with players. They can enter it at the Join page to join your league.
            </div>
            <div className="divider" />
            {/* Public guest view link — no sign-in required */}
            <div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>
                Public View Link
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-mid)', wordBreak: 'break-all', flex: 1 }}>
                  {`/view/${inviteCode}`}
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    const url = `${window.location.origin}/view/${inviteCode}`
                    navigator.clipboard.writeText(url)
                    setCopiedField('publicLink')
                    setTimeout(() => setCopiedField(null), 2000)
                  }}
                  disabled={!inviteCode}
                >
                  {copiedField === 'publicLink' ? '✓ Copied!' : '🔗 Copy Link'}
                </button>
                {inviteCode && (
                  <a
                    href={`/view/${inviteCode}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    style={{ textDecoration: 'none' }}
                  >
                    ↗ Preview
                  </a>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
                Anyone with this link can view live scores and standings — <strong style={{ color: 'var(--text)' }}>no sign-in required</strong>.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── League Rules Editor ── */}
      <div className="card mb-24">
        <div className="card-header"><div className="card-title">League Rules</div></div>
        <div className="card-body">
          <div className="grid-2" style={{ gap: 16, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Weekly Winner Payout ($)</label>
              <input
                type="number"
                className="form-input"
                value={rWeeklyWinner}
                min={0}
                onChange={e => setRWeeklyWinner(Number(e.target.value))}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Player with lowest total strokes wins this × (players − 1)</div>
            </div>
            <div className="form-group">
              <label className="form-label">Outright Winner Payout ($)</label>
              <input
                type="number"
                className="form-input"
                value={rOutrightWinner}
                min={0}
                onChange={e => setROutrightWinner(Number(e.target.value))}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Bonus for picking the actual PGA Tour winner</div>
            </div>
            <div className="form-group">
              <label className="form-label">Top 3 Bonus ($)</label>
              <input
                type="number"
                className="form-input"
                value={rTop3}
                min={0}
                onChange={e => setRTop3(Number(e.target.value))}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>Per golfer finishing T2 or T3 in the real tournament</div>
            </div>
            <div className="form-group">
              <label className="form-label">Picks per Player</label>
              <input
                type="number"
                className="form-input"
                value={rPicksPerPlayer}
                min={1}
                max={8}
                onChange={e => setRPicksPerPlayer(Number(e.target.value))}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>How many golfers each player drafts per tournament</div>
            </div>
          </div>
          <button className="btn btn-green" onClick={handleSaveRules} disabled={savingRules}>
            {savingRules ? '⏳ Saving…' : '💾 Save Rules'}
          </button>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card mb-24">
            <div className="card-header"><div className="card-title">Activate Tournament</div></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Select Event</label>
                <select
                  className="form-select"
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                >
                  <option value="">— Pick a tournament —</option>
                  {upcoming.length > 0 && (
                    <optgroup label="📅 Upcoming">
                      {upcoming.map((e) => (
                        <option key={e.name} value={e.name}>{e.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {past.length > 0 && (
                    <optgroup label="✓ Past">
                      {past.map((e) => (
                        <option key={e.name} value={e.name}>{e.name}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {selectedTournament && (
                <div className="alert alert-gold" style={{ marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{selectedTournament.name}</div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>{selectedTournament.course} · {selectedTournament.date}</div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Participants &amp; Draft Order</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Active participants in draft order with move buttons */}
                  {participants.map((p, i) => (
                    <div key={p} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'var(--green-dim)',
                      border: '1px solid rgba(74,222,128,0.25)',
                      transition: 'all 0.15s',
                    }}>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--green)', fontWeight: 700, minWidth: 22, textAlign: 'center' }}>
                        #{i + 1}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--green)', flex: 1 }}>{p}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button
                          type="button"
                          onClick={() => moveParticipantUp(i)}
                          disabled={i === 0}
                          style={{
                            background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                            color: i === 0 ? 'var(--border-bright)' : 'var(--text-dim)',
                            cursor: i === 0 ? 'default' : 'pointer', fontSize: 10, width: 24, height: 20,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                          }}
                          title="Move up"
                        >▲</button>
                        <button
                          type="button"
                          onClick={() => moveParticipantDown(i)}
                          disabled={i === participants.length - 1}
                          style={{
                            background: 'none', border: '1px solid var(--border)', borderRadius: 4,
                            color: i === participants.length - 1 ? 'var(--border-bright)' : 'var(--text-dim)',
                            cursor: i === participants.length - 1 ? 'default' : 'pointer', fontSize: 10, width: 24, height: 20,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                          }}
                          title="Move down"
                        >▼</button>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleParticipant(p)}
                        style={{
                          background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4,
                          color: 'var(--red)', cursor: 'pointer', fontSize: 11, padding: '2px 6px',
                        }}
                        title="Remove from draft"
                      >✕</button>
                    </div>
                  ))}
                  {/* Players not yet in the draft */}
                  {roster.filter(p => !participants.includes(p)).map((p) => (
                    <div key={p} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderRadius: 8,
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      opacity: 0.6,
                    }}>
                      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)', minWidth: 22, textAlign: 'center' }}>—</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-dim)', flex: 1 }}>{p}</span>
                      <button
                        type="button"
                        onClick={() => toggleParticipant(p)}
                        style={{
                          background: 'var(--green-dim)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 4,
                          color: 'var(--green)', cursor: 'pointer', fontSize: 11, padding: '2px 8px',
                        }}
                        title="Add to draft"
                      >+ Add</button>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                  Use ▲ ▼ to set draft order. Snake draft reverses on even rounds.
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div
                    onClick={() => setIsMajor(!isMajor)}
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: `2px solid ${isMajor ? 'var(--green)' : 'var(--border-bright)'}`,
                      background: isMajor ? 'var(--green)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
                    }}
                  >
                    {isMajor && <span style={{ color: '#0a0c0f', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>⛳ Major Championship</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Masters, PGA Championship, US Open, or The Open</div>
                  </div>
                </label>
              </div>
              <button className="btn btn-green" onClick={handleSetup} disabled={saving || !selectedTournament}>
                {saving ? '⏳ Saving…' : `${isMajor ? '⛳ Activate Major' : '⛳ Activate Tournament'}`}
              </button>
            </div>
          </div>
        </div>

        <div>
          {tournament && (
            <div className="card mb-24">
              <div className="card-header">
                <div className="card-title">Active Tournament</div>
                <span className="badge badge-green">Live</span>
              </div>
              <div className="card-body">
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{tournament.name}</div>
                  {tournament.course && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{tournament.course}</div>}
                  {tournament.date && <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>{tournament.date}</div>}
                </div>
                <div className="divider" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="btn btn-green" onClick={handleFinalize} disabled={finalizing || standings.length === 0}>
                    {finalizing ? '⏳ Recording…' : '✓ Finalize & Record Results'}
                  </button>
                  <button className="btn btn-outline" onClick={onClearPicks}>
                    🗑 Clear Picks (redo draft)
                  </button>
                  <button className="btn btn-danger" onClick={onClearTournament}>
                    ✕ Remove Tournament
                  </button>
                </div>
              </div>
            </div>
          )}

          {tournament && picks.length > 0 && (() => {
            const playerPicks = picks.filter((p) => p.player_name === swapPlayer)
            const takenGolfers = picks.map((p) => p.golfer_name.toLowerCase())
            const swapFiltered = liveData.filter(
              (g) => !takenGolfers.includes(g.name.toLowerCase()) &&
                g.name.toLowerCase().includes(swapSearch.toLowerCase())
            )
            const handleSwap = async (newGolfer: string) => {
              if (!swapPickId) return
              setSwapping(true)
              await onSwapGolfer(swapPickId, newGolfer)
              setSwapPickId(null)
              setSwapPickGolfer('')
              setSwapSearch('')
              setMsg(`✅ Swapped ${swapPickGolfer} → ${newGolfer} for ${swapPlayer}`)
              setSwapping(false)
              setTimeout(() => setMsg(''), 4000)
            }
            return (
              <div className="card mb-24">
                <div className="card-header">
                  <div className="card-title">Emergency Golfer Swap</div>
                  <span className="badge badge-gold">WD / Withdrawal</span>
                </div>
                <div className="card-body">
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
                    Replace a picked golfer who withdrew before the tournament. Select a player, click their golfer to replace, then choose a substitute.
                  </div>

                  <div className="form-group">
                    <label className="form-label">Select Player</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {roster.filter(p => picks.some(pk => pk.player_name === p)).map((p) => (
                        <button
                          key={p}
                          onClick={() => { setSwapPlayer(p); setSwapPickId(null); setSwapPickGolfer(''); setSwapSearch('') }}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: '1px solid', cursor: 'pointer',
                            fontFamily: 'Sora', fontSize: 13, fontWeight: 600,
                            background: swapPlayer === p ? 'var(--green-dim)' : 'var(--surface2)',
                            borderColor: swapPlayer === p ? 'rgba(74,222,128,0.3)' : 'var(--border)',
                            color: swapPlayer === p ? 'var(--green)' : 'var(--text-dim)',
                          }}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {swapPlayer && (
                    <div className="form-group">
                      <label className="form-label">
                        {swapPickId ? `Replacing: ${swapPickGolfer}` : `${swapPlayer}'s Picks — click to replace`}
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {playerPicks.map((pk) => (
                          <div
                            key={pk.id}
                            onClick={() => { setSwapPickId(pk.id); setSwapPickGolfer(pk.golfer_name); setSwapSearch('') }}
                            style={{
                              padding: '8px 14px', borderRadius: 8, border: '1px solid', cursor: 'pointer',
                              background: swapPickId === pk.id ? 'rgba(234,179,8,0.15)' : 'var(--surface2)',
                              borderColor: swapPickId === pk.id ? 'rgba(234,179,8,0.5)' : 'var(--border)',
                              color: swapPickId === pk.id ? '#eab308' : 'var(--text)',
                              fontWeight: swapPickId === pk.id ? 600 : 400,
                              fontSize: 13,
                              transition: 'all 0.15s',
                            }}
                          >
                            {pk.golfer_name}
                            {swapPickId === pk.id && <span style={{ marginLeft: 6, fontSize: 11 }}>✕ swap</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {swapPickId && (
                    <div className="form-group">
                      <label className="form-label">Choose Replacement Golfer</label>
                      <input
                        className="form-input"
                        placeholder="Search available golfers…"
                        value={swapSearch}
                        onChange={(e) => setSwapSearch(e.target.value)}
                        style={{ marginBottom: 8 }}
                      />
                      <div className="golfer-list">
                        {liveData.length === 0 && (
                          <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: 13 }}>
                            No live golfer data available. Type a name below to add manually.
                          </div>
                        )}
                        {swapFiltered.slice(0, 30).map((g) => (
                          <div
                            key={g.name}
                            className="golfer-option"
                            onClick={() => !swapping && handleSwap(g.name)}
                          >
                            <div>
                              <div style={{ fontWeight: 500 }}>{g.name}</div>
                              <div className="golfer-meta">#{g.position} · {g.score !== null ? (g.score > 0 ? `+${g.score}` : g.score === 0 ? 'E' : g.score) : '—'}</div>
                            </div>
                            <span className="badge badge-green">Swap In</span>
                          </div>
                        ))}
                        {swapSearch && !swapFiltered.find((g) => g.name.toLowerCase() === swapSearch.toLowerCase()) && (
                          <div className="golfer-option" onClick={() => !swapping && handleSwap(swapSearch)}>
                            <div>
                              <div style={{ fontWeight: 500 }}>{swapSearch}</div>
                              <div className="golfer-meta">Custom entry</div>
                            </div>
                            <span className="badge badge-gold">+ Add</span>
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn-outline"
                        style={{ marginTop: 10, fontSize: 12 }}
                        onClick={() => { setSwapPickId(null); setSwapPickGolfer(''); setSwapSearch('') }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          <div className="card">
            <div className="card-header"><div className="card-title">Payout Rules</div></div>
            <div className="card-body">
              {[
                ['🏆 Lowest Total Strokes', `$${leagueRules.scoring.weekly_winner} from each other player`],
                ['🎯 Outright Tournament Winner', `$${leagueRules.scoring.outright_winner} from each other player`],
                ['🔝 Top 3 Golfer (incl. ties)', `$${leagueRules.scoring.top3_bonus} from each other player`],
                ['✂️ Cut Golfer', 'R3 & R4 = average of R1 & R2 (rounded up)'],
                ['🚫 WD Golfer', 'Remaining rounds filled from last played round'],
              ].map(([rule, desc]) => (
                <div key={rule} style={{ padding: '11px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{rule}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'DM Mono', textAlign: 'right' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab({ history, golferHistory, isAdmin, roster, rules, onDeleteTournament, onEditResult, onDeleteResult }: {
  history: any[]
  golferHistory: any[]
  isAdmin: boolean
  roster: string[]
  rules: LeagueRules
  onDeleteTournament: (tournamentId: string, moneyByPlayer: Record<string, number>) => Promise<void>
  onEditResult: (tournamentId: string, playerName: string, field: 'total_score' | 'money_won', value: number) => Promise<void>
  onDeleteResult: (tournamentId: string, playerName: string, moneyWon: number) => Promise<void>
}) {
  const [editing, setEditing] = useState<{ tid: string; player: string; field: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [subtab, setSubtab] = useState<'tournaments' | 'golfers'>('tournaments')
  const [selectedPlayer, setSelectedPlayer] = useState<string>(roster[0] ?? '')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (tid: string, player: string) => {
    const key = `${tid}:${player}`
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!history.length) return (
    <div className="empty-state card">
      <div className="empty-icon">📈</div>
      <p>No past tournaments yet. Finalize one to record results.</p>
    </div>
  )

  const startEdit = (tid: string, player: string, field: string, current: any) => {
    setEditing({ tid, player, field })
    setEditVal(String(current))
  }

  const commitEdit = async () => {
    if (!editing) return
    const num = parseInt(editVal)
    if (isNaN(num)) { setEditing(null); return }
    await onEditResult(editing.tid, editing.player, editing.field as any, num)
    setEditing(null)
  }

  const handleDelete = async (h: any) => {
    if (!confirm(`Delete "${h.tournament_name}" from history? This will also reverse season money.`)) return
    setDeleting(h.tournament_id)
    await onDeleteTournament(h.tournament_id, h.money || {})
    setDeleting(null)
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">History</div>
        {isAdmin && <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>Click any score or $ to edit</div>}
      </div>

      {/* Subtab toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {(['tournaments', 'golfers'] as const).map(t => (
          <button key={t} onClick={() => setSubtab(t)} style={{
            padding: '8px 20px', borderRadius: 8, border: '1px solid',
            fontFamily: 'DM Mono', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
            background: subtab === t ? 'var(--green-dim)' : 'var(--surface2)',
            borderColor: subtab === t ? 'rgba(74,222,128,0.3)' : 'var(--border)',
            color: subtab === t ? 'var(--green)' : 'var(--text-dim)',
          }}>
            {t === 'tournaments' ? '📅 Tournaments' : '🏌️ Golfer Log'}
          </button>
        ))}
      </div>

      {subtab === 'golfers' && (
        <div>
          {/* Player selector */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            {roster.map(p => (
              <button key={p} onClick={() => setSelectedPlayer(p)} style={{
                padding: '8px 18px', borderRadius: 8, border: '1px solid',
                fontFamily: 'Sora', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: selectedPlayer === p ? 'var(--green-dim)' : 'var(--surface)',
                borderColor: selectedPlayer === p ? 'rgba(74,222,128,0.3)' : 'var(--border)',
                color: selectedPlayer === p ? 'var(--green)' : 'var(--text-dim)',
              }}>
                {p}
              </button>
            ))}
          </div>

          {/* Golfer log for selected player */}
          {(() => {
            const playerPicks = golferHistory.filter((g: any) => g.player_name === selectedPlayer)
            if (playerPicks.length === 0) return (
              <div className="empty-state card"><div className="empty-icon">🏌️</div><p>No golfer history yet for {selectedPlayer}. Finalize a tournament to record results.</p></div>
            )

            // Group by golfer name, sort by most picked
            const byGolfer: Record<string, any[]> = {}
            for (const g of playerPicks) {
              if (!byGolfer[g.golfer_name]) byGolfer[g.golfer_name] = []
              byGolfer[g.golfer_name].push(g)
            }
            const sortedGolfers = Object.entries(byGolfer).sort((a, b) => b[1].length - a[1].length)

            return (
              <div>
                {/* Summary cards */}
                <div className="stats-row mb-24">
                  <div className="stat-box">
                    <div className="stat-val">{playerPicks.length}</div>
                    <div className="stat-label">Total Picks</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-val">{Object.keys(byGolfer).length}</div>
                    <div className="stat-label">Unique Golfers</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-val" style={{ color: 'var(--gold)' }}>
                      {playerPicks.filter((g: any) => parseInt((g.position||'').replace(/^T/,'')) === 1).length}
                    </div>
                    <div className="stat-label">Tour Wins</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-val" style={{ color: 'var(--red)' }}>
                      {playerPicks.filter((g: any) => g.status === 'cut' || g.status === 'wd').length}
                    </div>
                    <div className="stat-label">Cuts</div>
                  </div>
                </div>

                {/* Per-golfer cards */}
                {sortedGolfers.map(([golferName, entries]) => {
                  const avgScore = entries.reduce((s: number, g: any) => s + (g.adj_score ?? 0), 0) / entries.length
                  return (
                    <div key={golferName} className="card mb-24">
                      <div className="card-header" style={{ background: 'var(--surface2)' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>{golferName}</div>
                          <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                            Picked {entries.length}× · Avg adj score {avgScore > 0 ? '+' : ''}{avgScore.toFixed(1)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {entries.filter((g: any) => parseInt((g.position||'').replace(/^T/,'')) <= 3 && !isNaN(parseInt((g.position||'').replace(/^T/,'')))).length > 0 && (
                            <span className="badge badge-gold">🏆 {entries.filter((g: any) => parseInt((g.position||'').replace(/^T/,'')) <= 3 && !isNaN(parseInt((g.position||'').replace(/^T/,'')))).length}× Top 3</span>
                          )}
                        </div>
                      </div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Tournament</th>
                            <th>Date</th>
                            <th>Finish</th>
                            <th>Score</th>
                            <th>R1</th>
                            <th>R2</th>
                            <th>R3</th>
                            <th>R4</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((g: any, i: number) => {
                            const pos = g.position || '—'
                            const posNum = parseInt(pos.replace(/^T/, ''))
                            const isCut = g.status === 'cut' || g.status === 'wd'
                            const rounds: (number|null)[] = g.rounds || [null,null,null,null]
                            return (
                              <tr key={i} className="row">
                                <td>
                                  <div style={{ fontWeight: 500 }}>{g.tournaments?.name || '—'}</div>
                                  {g.tournaments?.is_major && <span className="badge badge-gold" style={{ marginTop: 3 }}>Major</span>}
                                </td>
                                <td><span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>{g.tournaments?.date || '—'}</span></td>
                                <td>
                                  <span className={`rank ${posNum === 1 ? 'rank-1' : posNum === 2 ? 'rank-2' : posNum === 3 ? 'rank-3' : ''}`}>
                                    {isCut ? <span className="badge badge-red">✂ CUT</span> : pos}
                                  </span>
                                </td>
                                <td><span className={`score ${scoreClass(g.adj_score)}`}>{toRelScore(g.adj_score)}</span></td>
                                {rounds.map((r: number|null, ri: number) => (
                                  <td key={ri}>
                                    <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: isCut && ri >= 2 ? 'var(--text-dim)' : 'var(--text)', fontStyle: isCut && ri >= 2 ? 'italic' : 'normal' }}>
                                      {r ?? '—'}
                                    </span>
                                  </td>
                                ))}
                                <td>
                                  {g.status === 'cut' && <span className="badge badge-red">CUT</span>}
                                  {g.status === 'wd'  && <span className="badge badge-gray">WD</span>}
                                  {g.status === 'active' && <span className="badge badge-green">Active</span>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {subtab === 'tournaments' && history.map((h: any, i: number) => (
        <div key={i} className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{h.tournament_name}</div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{h.date}</div>
            </div>
            {isAdmin && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleDelete(h)}
                disabled={deleting === h.tournament_id}
              >
                {deleting === h.tournament_id ? '⏳' : '🗑'} Delete
              </button>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Rank</th>
                <th>Player</th>
                <th>Score</th>
                <th>Winnings</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {[...(h.standings || [])].sort((a: any, b: any) => a.rank - b.rank).map((s: any) => {
                const moneyVal = h.money?.[s.player] || 0
                const isEditingScore = isAdmin && editing?.tid === h.tournament_id && editing?.player === s.player && editing?.field === 'total_score'
                const isEditingMoney = isAdmin && editing?.tid === h.tournament_id && editing?.player === s.player && editing?.field === 'money_won'
                const rowKey = `${h.tournament_id}:${s.player}`
                const isExpanded = expandedRows.has(rowKey)
                const playerGolfers = golferHistory.filter(
                  (g: any) => g.tournament_id === h.tournament_id && g.player_name === s.player
                )
                const colSpan = isAdmin ? 6 : 5
                return (
                  <>
                    <tr key={s.player} className="row" style={{ cursor: 'pointer' }} onClick={() => toggleRow(h.tournament_id, s.player)}>
                      <td style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', userSelect: 'none' }}>▼</td>
                      <td><span className={`rank rank-${s.rank}`}>#{s.rank}</span></td>
                      <td><strong>{s.player}</strong></td>
                      <td onClick={e => e.stopPropagation()}>
                        {isEditingScore ? (
                          <input
                            autoFocus
                            type="number"
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            style={{ width: 70, background: 'var(--surface2)', border: '1px solid var(--green)', borderRadius: 4, color: 'var(--text)', padding: '2px 6px', fontFamily: 'DM Mono', fontSize: 13, textAlign: 'center' }}
                          />
                        ) : (
                          <span
                            className={`score ${scoreClass(s.score)}`}
                            onClick={() => isAdmin && startEdit(h.tournament_id, s.player, 'total_score', s.score)}
                            style={isAdmin ? { cursor: 'pointer', borderBottom: '1px dashed var(--text-dim)' } : {}}
                            title={isAdmin ? 'Click to edit score' : ''}
                          >
                            {toRelScore(s.score)}
                          </span>
                        )}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        {isEditingMoney ? (
                          <input
                            autoFocus
                            type="number"
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            style={{ width: 80, background: 'var(--surface2)', border: '1px solid var(--green)', borderRadius: 4, color: 'var(--text)', padding: '2px 6px', fontFamily: 'DM Mono', fontSize: 13, textAlign: 'center' }}
                          />
                        ) : (
                          <span
                            className={`score ${moneyVal > 0 ? 'under' : moneyVal < 0 ? 'over' : 'even'}`}
                            onClick={() => isAdmin && startEdit(h.tournament_id, s.player, 'money_won', moneyVal)}
                            style={isAdmin ? { cursor: 'pointer', borderBottom: '1px dashed var(--text-dim)' } : {}}
                            title={isAdmin ? 'Click to edit winnings' : ''}
                          >
                            {formatMoney(moneyVal)}
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td onClick={e => e.stopPropagation()}>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              if (confirm(`Remove ${s.player} from this tournament? Their money will be reversed.`))
                                onDeleteResult(h.tournament_id, s.player, moneyVal)
                            }}
                            title="Remove this player's result"
                          >✕</button>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr key={`${s.player}-expanded`}>
                        <td colSpan={colSpan} style={{ padding: 0, background: 'rgba(0,0,0,0.2)' }}>
                          {playerGolfers.length === 0 ? (
                            <div style={{ padding: '10px 24px', color: 'var(--text-dim)', fontFamily: 'DM Mono', fontSize: 12 }}>No golfer data saved for this tournament.</div>
                          ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                              <thead>
                                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                                  <th style={{ padding: '6px 12px 6px 32px', textAlign: 'left', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>Golfer</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>Finish</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>Score</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>R1</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>R2</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>R3</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 600 }}>R4</th>
                                </tr>
                              </thead>
                              <tbody>
                                {playerGolfers.map((g: any, gi: number) => {
                                  const pos = g.position || '—'
                                  const posNum = parseInt(pos.replace(/^T/, ''))
                                  const isCut = g.status === 'cut' || g.status === 'wd'
                                  const rounds: (number | null)[] = g.rounds || [null, null, null, null]
                                  return (
                                    <tr key={gi} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: isCut ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                                      <td style={{ padding: '7px 12px 7px 32px', fontWeight: 600 }}>{g.golfer_name}</td>
                                      <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                        {isCut ? (
                                          <span className="badge badge-red" style={{ fontSize: 10 }}>✂ CUT</span>
                                        ) : (
                                          <span className={`rank ${posNum === 1 ? 'rank-1' : posNum === 2 ? 'rank-2' : posNum === 3 ? 'rank-3' : ''}`} style={{ fontSize: 12 }}>{pos}</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                                        <span className={`score ${scoreClass(g.adj_score)}`} style={{ fontSize: 12 }}>{toRelScore(g.adj_score)}</span>
                                      </td>
                                      {rounds.map((r: number | null, ri: number) => (
                                        <td key={ri} style={{ padding: '7px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 12, color: isCut && ri >= 2 ? 'var(--text-dim)' : 'var(--text)', fontStyle: isCut && ri >= 2 ? 'italic' : 'normal' }}>
                                          {r ?? '—'}
                                        </td>
                                      ))}
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          </div>

          {/* ── Net Payout Breakdown ── */}
          {(() => {
            const money = h.money || {}

            // Only include players who actually participated in this tournament
            const participants: string[] = (h.standings || []).map((s: any) => s.player)

            // Build gross debts between every pair: who owes who what gross amount
            // net[A][B] = net amount A owes B (can go negative meaning B owes A)
            const net: Record<string, Record<string, number>> = {}
            participants.forEach(a => { net[a] = {}; participants.forEach(b => { net[a][b] = 0 }) })

            const standings = h.standings || []
            const strokeWinner = [...standings].sort((a: any, b: any) => a.score - b.score)[0]
            const tourWinners = standings.filter((s: any) => s.has_winner)
            const top3Players = standings.filter((s: any) => s.has_top3)

            // Payouts from the league rules (majors scale by the multiplier)
            const mult = h.is_major ? (rules.multipliers?.major ?? 1) : 1
            if (strokeWinner) {
              participants.filter(p => p !== strokeWinner.player).forEach(p => {
                net[p][strokeWinner.player] += rules.scoring.weekly_winner * mult
              })
            }
            tourWinners.forEach((w: any) => {
              participants.filter(p => p !== w.player).forEach(p => {
                net[p][w.player] += rules.scoring.outright_winner * mult
              })
            })
            top3Players.forEach((w: any) => {
              participants.filter(p => p !== w.player).forEach(p => {
                net[p][w.player] += rules.scoring.top3_bonus * mult
              })
            })

            // Collapse to net: for each pair only keep the net direction
            const netPayments: { from: string; to: string; amount: number }[] = []
            const seen = new Set<string>()
            participants.forEach(a => {
              participants.forEach(b => {
                if (a === b) return
                const key = [a, b].sort().join('|')
                if (seen.has(key)) return
                seen.add(key)
                const aOwesB = net[a][b]
                const bOwesA = net[b][a]
                const netAmt = aOwesB - bOwesA
                if (netAmt > 0) netPayments.push({ from: a, to: b, amount: netAmt })
                else if (netAmt < 0) netPayments.push({ from: b, to: a, amount: -netAmt })
              })
            })

            if (netPayments.length === 0) return null

            // Group by payer
            const byPayer: Record<string, { to: string; amount: number }[]> = {}
            netPayments.forEach(p => {
              if (!byPayer[p.from]) byPayer[p.from] = []
              byPayer[p.from].push({ to: p.to, amount: p.amount })
            })

            // Group payers who owe the exact same amounts to the same people
            const patternKey = (items: { to: string; amount: number }[]) =>
              [...items].sort((a,b) => a.to.localeCompare(b.to)).map(i => `${i.to}:${i.amount}`).join('|')

            const groups: { payers: string[]; items: { to: string; amount: number }[] }[] = []
            Object.entries(byPayer).forEach(([payer, items]) => {
              const key = patternKey(items)
              const existing = groups.find(g => patternKey(g.items) === key)
              if (existing) existing.payers.push(payer)
              else groups.push({ payers: [payer], items })
            })

            return (
              <div style={{ borderTop: '1px solid var(--border)', padding: '14px 24px', background: 'rgba(0,0,0,0.15)' }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 12 }}>
                  Net Payouts
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {groups.map((group, gi) => (
                    <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      {/* Payers */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        {group.payers.map((payer, pi) => (
                          <span key={payer} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--red)' }}>{payer}</span>
                            {pi < group.payers.length - 1 && <span style={{ color: 'var(--text-dim)', fontSize: 11, margin: '0 2px' }}>&</span>}
                          </span>
                        ))}
                        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', marginLeft: 4 }}>each pay</span>
                      </div>
                      {/* What they owe */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {group.items.map((item, i) => (
                          <span key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            background: 'var(--surface2)', border: '1px solid var(--border)',
                            borderRadius: 6, padding: '4px 10px', fontSize: 13,
                          }}>
                            <span style={{ fontFamily: 'DM Mono', color: 'var(--red)', fontWeight: 700 }}>${item.amount}</span>
                            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>→</span>
                            <span style={{ fontWeight: 600 }}>{item.to}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

        </div>
      ))}
    </div>
  )
}

// Stats view for custom (non-founding) leagues. Derives everything from the
// league's own history — no hardcoded baselines can leak original-league data.
function CustomLeagueStatsView({ history }: { history: any[] }) {
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
    </div>
  )
}

function StatsTab({ history, leagueId }: { history: any[]; leagueId: string }) {
  // Hooks must be called unconditionally; branch after.
  const [activeYear, setActiveYear] = useState<number | 'all'>('all')
  const isFoundingLeague = leagueId === FOUNDING_LEAGUE_ID
  // Custom leagues get a scoped view derived entirely from their own
  // history. The hardcoded ALL_STATS / MAJORS_HISTORY baselines below are
  // intentionally untouched — they only render for the founding league.
  if (!isFoundingLeague) return <CustomLeagueStatsView history={history} />

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
    </div>
  )
}

// ─── Season Recap Tab ─────────────────────────────────────────────────────────
function SeasonRecapTab({ history, golferHistory, seasonMoney, leagueId }: {
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
export default function App() {
  const supabase = createClient()
  const router = useRouter()

  // Handle both auth flows:
  // - Implicit flow: /#access_token=... (detectSessionInUrl:true handles automatically, just clean hash)
  // - PKCE flow: /?code=... (flowType:'implicit' may be ignored in supabase-js v2.44+, still sends PKCE)
  useEffect(() => {
    if (window.location.hash.includes('access_token')) {
      window.history.replaceState(null, '', window.location.pathname)
      return
    }
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        window.history.replaceState(null, '', window.location.pathname)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null)
  const [tab, setTab] = useState('live')
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [liveData, setLiveData] = useState<GolferScore[]>([])
  const [prevScores, setPrevScores] = useState<Record<string, number | null>>({})
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({})
  const [seasonMoney, setSeasonMoney] = useState<SeasonMoney[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [golferHistory, setGolferHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // false when /api/scores served MOCK fallback data (ESPN outage/off-season).
  // Mock scores must never be finalized into results.
  const [isLiveData, setIsLiveData] = useState(true)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [tabKey, setTabKey] = useState(0)
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [userProfile, setUserProfile] = useState<{ display_name: string; is_admin: boolean } | null>(null)
  // No default league — set only after auth resolves to a real membership.
  // Prevents the "auto-load original league for non-members" leak.
  const [leagueId, setLeagueId] = useState<string>('')
  const [leagueName, setLeagueName] = useState<string>('Fore Picks')
  const [leagueRules, setLeagueRules] = useState<LeagueRules>(DEFAULT_RULES)
  const [inviteCode, setInviteCode] = useState<string>('')
  const [commissionerId, setCommissionerId] = useState<string | null>(null)
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [guestMode, setGuestMode] = useState(false)

  // Admin if: super-admin flag on profile (DB-controlled, backfilled by
  // migration 008), OR commissioner of THIS league. Name-based fallbacks are
  // gone — a display name is not a credential.
  const isAdmin =
    (userProfile?.is_admin ?? false) ||
    (commissionerId !== null && commissionerId === user?.id)
  const isMasters = !!(tournament?.name?.toLowerCase().includes('masters'))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showClaimModal, setShowClaimModal] = useState(false)
  // Tracks whether we've completed the initial profile load for the current user.
  // Used to prevent TOKEN_REFRESHED events from clearing already-loaded state.
  const profileLoadedRef = useRef(false)
  // Holds league id+name passed via URL when navigating from /create.
  // Set synchronously before the auth effect's async callbacks run, so
  // whichever auth path fires first can consume it exactly once.
  const pendingNewLeagueRef = useRef<{ id: string; name: string } | null>(null)
  // Dedupes /api/init-user across duplicate auth events. supabase-js refires
  // SIGNED_IN on tab focus, INITIAL_SESSION at mount, etc. — without this
  // guard init-user was being hit several times per second per session.
  const initedUserIdRef = useRef<string | null>(null)

  // ── Read new-league URL params from /create navigation (runs before auth callbacks) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('newLeague')
    const name = params.get('newLeagueName')
    if (id) {
      pendingNewLeagueRef.current = { id, name: name ? decodeURIComponent(name) : 'My League' }
      // Persist so subsequent page loads (refreshes) still open this league.
      localStorage.setItem('activeLeagueId', id)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  // Apply Masters theme to body when Masters tournament is active
  useEffect(() => {
    if (isMasters) {
      document.body.setAttribute('data-theme', 'masters')
    } else {
      document.body.removeAttribute('data-theme')
    }
    return () => document.body.removeAttribute('data-theme')
  }, [isMasters])

  // Tab change with animation reset
  const handleTabChange = useCallback((t: string) => {
    setTab(t)
    setTabKey(k => k + 1)
    setSidebarOpen(false)
  }, [])

  // ── Auth state management ──
  useEffect(() => {
    // Load a league read-only via the public-view path. Used when there is no
    // session (guest) and as the fallback when auth is slow — a returning
    // visitor with a saved league should see the leaderboard instantly, never
    // the landing page.
    const loadGuestLeague = async (): Promise<boolean> => {
      const savedLeagueId = localStorage.getItem('activeLeagueId')
      if (!savedLeagueId) return false
      const res = await fetch(`/api/league-data?league_id=${savedLeagueId}`).then(r => r.json()).catch(() => null)
      if (!res || res.error) return false
      setLeagueId(savedLeagueId)
      if (res.leagueName) setLeagueName(res.leagueName)
      if (res.leagueRules) setLeagueRules(mergeRules(res.leagueRules))
      if (res.inviteCode) setInviteCode(res.inviteCode)
      setGuestMode(true)
      return true
    }

    // Shared post-sign-in init used by the getSession() path and the
    // onAuthStateChange path (previously two diverging copies of this logic).
    // Returns false when a transient error means state shouldn't change.
    const initAuthedUser = async (session: any): Promise<void> => {
      const u = { id: session.user.id, email: session.user.email ?? '' }
      setUser(u)
      // Dedupe: SIGNED_IN refires on tab focus, INITIAL_SESSION on mount —
      // without this we'd re-hit /api/init-user constantly.
      if (initedUserIdRef.current === u.id) {
        setBootstrapped(true)
        return
      }
      initedUserIdRef.current = u.id

      const storedLeague = localStorage.getItem('activeLeagueId')
      const initUrl = storedLeague
        ? `/api/init-user?preferred_league_id=${storedLeague}`
        : '/api/init-user'
      const res = await fetch(initUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then(r => r.json()).catch(() => null)
      const { profile, membership } = res ?? {}

      if (profile) {
        profileLoadedRef.current = true
        setUserProfile(profile)
        setCurrentPlayer(profile.display_name)
        setGuestMode(false)
        const pl = pendingNewLeagueRef.current
        if (pl) {
          pendingNewLeagueRef.current = null
          setLeagueId(pl.id)
          setLeagueName(pl.name)
          setCommissionerId(u.id)
        } else if (membership) {
          setLeagueId(membership.league_id)
          localStorage.setItem('activeLeagueId', membership.league_id)
          const l = membership.leagues as any
          if (l) {
            setLeagueName(l.name)
            setLeagueRules(mergeRules(l.rules ?? {}))
            setCommissionerId(l.commissioner_id ?? null)
          }
        } else {
          // Signed in but not a member of any league — send to Dashboard
          // to create or join one. Never auto-load the original league.
          localStorage.removeItem('activeLeagueId')
          router.replace('/dashboard')
          return
        }
      } else if (!profileLoadedRef.current) {
        // Genuinely new user with no profile — SetupProfileScreen shows.
        // (If the fetch failed transiently for an already-loaded user, state
        // is left alone so the app doesn't flash SetupProfileScreen.)
        if (res) {
          setUserProfile(null)
          setCurrentPlayer(null)
        } else {
          // init-user itself failed (network) — allow a retry on next event.
          initedUserIdRef.current = null
        }
      }
      setBootstrapped(true)
    }

    // Race getSession() against a timeout — supabase-js v2 sometimes does a
    // server-side token validation request inside getSession() which can hang.
    const sessionRace = Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('auth_timeout')), 4000)),
    ])

    sessionRace.then(async ({ data: { session } }: any) => {
      if (session?.user) {
        await initAuthedUser(session)
      } else {
        await loadGuestLeague()
        setBootstrapped(true)
      }
    }).catch(async () => {
      // Auth timed out. A device with a saved league still gets the live
      // leaderboard as a guest while onAuthStateChange catches up in the
      // background — slow hotel wifi must never mean a landing-page bounce.
      await loadGuestLeague()
      setBootstrapped(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // TOKEN_REFRESHED fires on tab focus, scroll, and every token expiry.
      // The user and profile haven't changed — skip to avoid flashing SetupProfileScreen.
      if (event === 'TOKEN_REFRESHED') return
      // INITIAL_SESSION usually duplicates what getSession() handled —
      // initAuthedUser's dedupe makes that a no-op. But when getSession()
      // timed out (guest fallback), INITIAL_SESSION may be the only event
      // carrying the persisted session, so it must be processed: it upgrades
      // the guest view to the signed-in app.
      if (event === 'INITIAL_SESSION' && !session?.user) return

      if (session?.user) {
        await initAuthedUser(session)
      } else {
        profileLoadedRef.current = false
        initedUserIdRef.current = null
        setUser(null)
        setUserProfile(null)
        setCurrentPlayer(null)
        setBootstrapped(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Fetch DB data when logged in (scoped to current league) ──
  const loadData = useCallback(async () => {
    // Single API call. Members send their token for the full payload
    // (including the invite code); guests get the public-view subset.
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}
    const leagueDataRes = await fetch(`/api/league-data?league_id=${leagueId}`, { headers })
      .then(r => r.json()).catch(() => null)

    if (leagueDataRes && !leagueDataRes.error) {
      const { activeTournament, seasonMoney: sm, results, golferResults, picks: p, inviteCode: ic, commissionerId: cid, members: mem } = leagueDataRes
      if (ic != null) setInviteCode(ic)
      if (cid !== undefined) setCommissionerId(cid)
      if (Array.isArray(mem)) setMembers(mem)

      if (sm) setSeasonMoney(sm)

      if (activeTournament) {
        setTournament(activeTournament)
        setPicks(p ?? [])
      } else {
        setTournament(null)
        setPicks([])
      }

      // Build history from results
      if (results?.length > 0) {
        const grouped: Record<string, any> = {}
        for (const r of results) {
          const tid = r.tournament_id
          if (!grouped[tid]) {
            grouped[tid] = {
              tournament_id: tid,
              tournament_name: r.tournaments?.name,
              date: r.tournaments?.date,
              is_major: r.tournaments?.is_major || false,
              standings: [],
              money: {},
              winner_player: null,
            }
          }
          grouped[tid].standings.push({
            player: r.player_name,
            score: r.total_score,
            rank: r.rank,
            has_winner: r.has_winner,
            has_top3: r.has_top3,
            golfers_cut: r.golfers_cut || 0,
          })
          grouped[tid].money[r.player_name] = r.money_won
          if (r.rank === 1) grouped[tid].winner_player = r.player_name
        }
        setHistory(Object.values(grouped))
      } else {
        setHistory([])
      }

      setGolferHistory(golferResults ?? [])
    }

    setDataLoaded(true)
  }, [leagueId])

  useEffect(() => {
    // Only load data once we have a real leagueId — prevents requests
    // against an empty id during the auth bootstrap.
    if (!leagueId) return
    if (currentPlayer || guestMode) loadData()
  }, [currentPlayer, guestMode, loadData, leagueId])

  // ── Live score polling ──
  const fetchScores = useCallback(async () => {
    if (!tournament) return
    setLoading(true)
    try {
      const res = await fetch('/api/scores')
      const payload = await res.json()
      // New shape: { golfers, isLive, fetchedAt }. (Array fallback covers a
      // cached pre-upgrade response.)
      const data: GolferScore[] = Array.isArray(payload) ? payload : payload.golfers ?? []
      setIsLiveData(Array.isArray(payload) ? true : payload.isLive !== false)
      // Detect score changes for flash animation
      setLiveData(prev => {
        const newFlash: Record<string, 'up' | 'down'> = {}
        for (const g of data) {
          const old = prev.find(p => p.name === g.name)
          if (old && old.score !== null && g.score !== null && old.score !== g.score) {
            newFlash[g.name] = g.score < old.score ? 'up' : 'down'
          }
        }
        if (Object.keys(newFlash).length > 0) {
          setFlashMap(newFlash)
          setTimeout(() => setFlashMap({}), 1400)
        }
        return data
      })
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }, [tournament])

  useEffect(() => {
    if (tournament) {
      fetchScores()
      const interval = setInterval(fetchScores, 120_000)
      return () => clearInterval(interval)
    }
  }, [tournament, fetchScores])

  // ── Realtime subscriptions ──
  useEffect(() => {
    if (!currentPlayer) return
    const channel = supabase
      .channel('picks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentPlayer])

  // ── Computed ──
  // Active-week scoring uses the tournament's frozen rules_snapshot so a
  // mid-season rules edit can never retroactively change a week in play.
  const effectiveRules = mergeRules(((tournament as any)?.rules_snapshot as Partial<LeagueRules>) ?? leagueRules)
  const roster = getLeagueRoster({
    leagueId,
    members,
    draftOrder: tournament?.draft_order,
  })
  const pickMap = buildPickMap(picks)
  const standings = computeStandings(liveData, pickMap, roster, effectiveRules)
  const weekMoney = computeMoney(standings, roster, effectiveRules, (tournament as any)?.is_major ?? false)

  // ── Handlers ──
  const handleLogout = async () => {
    await supabase.auth.signOut()
    // Full reload for a clean slate — the bootstrap will come back up in
    // guest mode for a public-view league (activeLeagueId is kept), instead
    // of leaving half-authenticated state behind.
    window.location.reload()
  }

  const handleSetupTournament = async (data: { name: string; course: string; date: string; draft_order: string[]; is_major: boolean }) => {
    // Get THIS league's active tournament so we can clear its picks. The
    // league_id filter is critical — without it this used to find (and
    // finalize, and delete the picks of) another league's active tournament.
    const { data: oldT } = await supabase
      .from('tournaments')
      .select('id')
      .eq('status', 'active')
      .eq('league_id', leagueId)
      .maybeSingle()
    if (oldT) {
      await supabase.from('picks').delete().eq('tournament_id', oldT.id)
      await supabase.from('tournaments').update({ status: 'finalized' }).eq('id', oldT.id)
    }
    const { data: t } = await supabase.from('tournaments').insert({ ...data, status: 'active', league_id: leagueId, rules_snapshot: leagueRules }).select().single()
    if (t) setTournament(t)
    setPicks([])
    await loadData()
  }

  const handlePickMade = async (golferName: string, playerName: string) => {
    if (!tournament) return
    const playerPicks = picks.filter((p) => p.player_name === playerName)
    const pickOrder = playerPicks.length + 1
    await supabase.from('picks').insert({
      tournament_id: tournament.id,
      player_name: playerName,
      golfer_name: golferName,
      pick_order: pickOrder,
    })
    await loadData()
  }

  const handleFinalize = async () => {
    if (!tournament || !standings.length) return
    if (!isLiveData) {
      alert('Live scores are unavailable right now (showing placeholder data). Finalizing is disabled until the real feed is back — try again in a few minutes.')
      return
    }
    const money = weekMoney

    // Insert results
    const resultRows = standings.map((s) => ({
      tournament_id: tournament.id,
      player_name: s.player,
      total_score: s.totalScore,
      rank: s.rank,
      has_winner: s.hasWinner,
      has_top3: s.top3Count > 0,
      money_won: money[s.player] || 0,
      golfers_cut: s.golfers.filter((g: any) => g.status === 'cut' || g.status === 'wd').length,
    }))
    await supabase.from('results').upsert(resultRows, { onConflict: 'tournament_id,player_name' })

    // Save individual golfer results
    const golferRows: any[] = []
    for (const s of standings) {
      for (const g of s.golfers) {
        golferRows.push({
          tournament_id: tournament.id,
          player_name: s.player,
          golfer_name: g.name,
          position: g.position ?? '—',
          score: g.score ?? null,
          adj_score: g.adjScore ?? null,
          status: g.status ?? 'active',
          rounds: g.rounds ?? [],
        })
      }
    }
    await supabase.from('golfer_results').upsert(golferRows, { onConflict: 'tournament_id,player_name,golfer_name' })

    // Season money is derived from results server-side — no running-total
    // writes needed (the drift-prone season_money table is display-legacy).

    await supabase.from('tournaments').update({ status: 'finalized' }).eq('id', tournament.id)
    setTournament(null)
    await loadData()
  }

  const handleClearTournament = async () => {
    if (!tournament) return
    await supabase.from('tournaments').delete().eq('id', tournament.id)
    setTournament(null)
    setPicks([])
    await loadData()
  }

  const handleClearPicks = async () => {
    if (!tournament) return
    await supabase.from('picks').delete().eq('tournament_id', tournament.id)
    setPicks([])
  }

  const handleSwapGolfer = async (pickId: string, newGolferName: string) => {
    await supabase.from('picks').update({ golfer_name: newGolferName }).eq('id', pickId)
    await loadData()
  }

  const handleDeleteTournament = async (tournamentId: string, _moneyByPlayer: Record<string, number>) => {
    // Season money is derived from results, so deleting the rows is enough.
    await supabase.from('results').delete().eq('tournament_id', tournamentId)
    await supabase.from('tournaments').delete().eq('id', tournamentId)
    await loadData()
  }

  const handleDeleteResult = async (tournamentId: string, playerName: string, moneyWon: number) => {
    // Delete the result row
    await supabase.from('results').delete()
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)
    // Delete golfer results for this player in this tournament
    await supabase.from('golfer_results').delete()
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)
    await loadData()
  }

  const handleEditResult = async (tournamentId: string, playerName: string, field: 'total_score' | 'money_won', value: number) => {
    await supabase.from('results')
      .update({ [field]: value })
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)
    // Season money is derived from results server-side — reload picks it up.
    await loadData()
  }

  const handleSaveRules = async (newRules: Partial<LeagueRules>) => {
    const merged = mergeRules(newRules)
    await supabase.from('leagues').update({ rules: merged }).eq('id', leagueId)
    setLeagueRules(merged)
  }

  const handleSaveInviteCode = async (code: string) => {
    // Direct update under the commissioner RLS policy (008). The old
    // /api/league-info route hardcoded the FOUNDING league id, so "saving"
    // a custom league's code silently rewrote the original league's.
    const cleaned = code.trim().toUpperCase()
    const { error } = await supabase.from('leagues')
      .update({ invite_code: cleaned })
      .eq('id', leagueId)
    if (error) {
      alert(error.code === '23505'
        ? 'That invite code is already taken — try another.'
        : 'Could not save the invite code. Only the commissioner can change it.')
      return
    }
    setInviteCode(cleaned)
  }

  if (!bootstrapped) return <div className="loading-screen"><div className="spin" style={{ fontSize: 32 }}>⛳</div>Loading…</div>
  if (!user && !guestMode) return <LandingPage />
  if (user && !userProfile && !guestMode) return (
    <SetupProfileScreen
      supabase={supabase}
      userId={user.id}
      userEmail={user.email}
      onComplete={async (displayName) => {
        profileLoadedRef.current = true
        // is_admin comes from the server (init-user), never from the client.
        setUserProfile({ display_name: displayName, is_admin: false })
        setCurrentPlayer(displayName)
        const pl = pendingNewLeagueRef.current
        if (pl) {
          pendingNewLeagueRef.current = null
          setLeagueId(pl.id)
          setLeagueName(pl.name)
          setCommissionerId(user.id)
          return
        }
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const storedLeague = localStorage.getItem('activeLeagueId')
        const initUrl = storedLeague
          ? `/api/init-user?preferred_league_id=${storedLeague}`
          : '/api/init-user'
        fetch(initUrl, { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then(r => r.json())
          .then(({ profile, membership }) => {
            if (profile) setUserProfile(profile)
            if (membership) {
              setLeagueId(membership.league_id)
              localStorage.setItem('activeLeagueId', membership.league_id)
              const l = membership.leagues as any
              if (l) {
                setLeagueName(l.name)
                setLeagueRules(mergeRules(l.rules ?? {}))
                setCommissionerId(l.commissioner_id ?? null)
              }
            }
          })
          .catch(() => {})
      }}
    />
  )

  return (
    <div className="app-shell">
      {/* Hamburger button — mobile only, hide when sidebar open */}
      {!sidebarOpen && (
        <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
          <span /><span /><span />
        </button>
      )}
      <Sidebar
        currentPlayer={currentPlayer ?? ''}
        tab={tab}
        setTab={handleTabChange}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        tournament={tournament}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMasters={isMasters}
        leagueName={leagueName}
        onClaimPlayer={() => setShowClaimModal(true)}
        showClaim={!!user && leagueId === FOUNDING_LEAGUE_ID && !LEGACY_PLAYERS.includes(currentPlayer ?? '')}
      />
      {showClaimModal && user && (
        <ClaimPlayerModal
          supabase={supabase}
          userId={user.id}
          userEmail={user.email}
          onComplete={(name) => {
            profileLoadedRef.current = true
            setCurrentPlayer(name)
            setUserProfile(prev => ({ display_name: name, is_admin: prev?.is_admin ?? false }))
            setShowClaimModal(false)
          }}
          onClose={() => setShowClaimModal(false)}
        />
      )}
      <main className="main-content">
        {!dataLoaded ? (
          <SkeletonScreen />
        ) : (
          <div key={tabKey} className="tab-content">
            {tab === 'live'    && <LeaderboardTab tournament={tournament} standings={standings} roster={roster} liveData={liveData} pickMap={pickMap} loading={loading} lastUpdated={lastUpdated} onRefresh={fetchScores} money={weekMoney} flashMap={flashMap} />}
            {tab === 'picks'   && <PicksTab standings={standings} pickMap={pickMap} liveData={liveData} tournament={tournament} roster={roster} />}
            {tab === 'money'   && <MoneyTab seasonMoney={seasonMoney} weekMoney={weekMoney} tournament={tournament} history={history} roster={roster} rules={effectiveRules} />}
            {tab === 'draft'   && <DraftTab tournament={tournament} picks={picks} liveData={liveData} currentPlayer={currentPlayer ?? ''} isAdmin={isAdmin} onPickMade={handlePickMade} picksPerPlayer={effectiveRules.picks_per_player} />}
            {tab === 'history' && <HistoryTab history={history} golferHistory={golferHistory} isAdmin={isAdmin} roster={roster} rules={leagueRules} onDeleteTournament={handleDeleteTournament} onEditResult={handleEditResult} onDeleteResult={handleDeleteResult} />}
            {tab === 'stats'   && <StatsTab history={history} leagueId={leagueId} />}
            {tab === 'recap'   && <SeasonRecapTab history={history} golferHistory={golferHistory} seasonMoney={seasonMoney} leagueId={leagueId} />}
            {tab === 'admin'   && isAdmin && <AdminTab tournament={tournament} standings={standings} weekMoney={weekMoney} picks={picks} liveData={liveData} leagueId={leagueId} inviteCode={inviteCode} leagueRules={leagueRules} roster={roster} onSetupTournament={handleSetupTournament} onFinalize={handleFinalize} onClearTournament={handleClearTournament} onClearPicks={handleClearPicks} onSwapGolfer={handleSwapGolfer} onSaveRules={handleSaveRules} onSaveInviteCode={handleSaveInviteCode} />}
          </div>
        )}
      </main>

      {/* ── Bottom tab bar — mobile only ── */}
      <nav className="bottom-tab-bar">
        {[
          { key: 'live',    icon: '⛳', label: 'Live' },
          { key: 'picks',   icon: '🏌️', label: 'Picks' },
          { key: 'draft',   icon: '📋', label: 'Draft' },
          { key: 'money',   icon: '💰', label: 'Money' },
          { key: 'history', icon: '📈', label: 'History' },
          { key: 'stats',   icon: '🏅', label: 'Stats' },
          { key: 'recap',   icon: '🏆', label: 'Recap' },
          ...(isAdmin ? [{ key: 'admin', icon: '⚙️', label: 'Admin' }] : []),
        ].map(item => (
          <button
            key={item.key}
            className={`bottom-tab-btn ${tab === item.key ? 'active' : ''}`}
            onClick={() => handleTabChange(item.key)}
          >
            <span className="bottom-tab-icon">{item.icon}</span>
            <span className="bottom-tab-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
