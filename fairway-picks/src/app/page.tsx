'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import {
  toRelScore, scoreClass, formatMoney, moneyClass,
  buildPickMap, computeStandings, computeMoney, snakeDraftOrder
} from '@/lib/scoring'
import { PLAYERS, PAYOUT_RULES } from '@/lib/types'
import type { Tournament, Pick, GolferScore, PlayerStanding, SeasonMoney } from '@/lib/types'

const PICKS_PER_PLAYER = 4

// ─── 2026 PGA Tour Schedule ───────────────────────────────────────────────────
const PGA_SCHEDULE = [
  { name: 'The Sentry',                        course: 'Plantation Course at Kapalua',       date: '2026-01-08' },
  { name: 'Sony Open in Hawaii',                course: 'Waialae Country Club',               date: '2026-01-15' },
  { name: 'The American Express',               course: 'PGA West / La Quinta CC',            date: '2026-01-22' },
  { name: 'Farmers Insurance Open',             course: 'Torrey Pines Golf Course',           date: '2026-01-29' },
  { name: 'AT&T Pebble Beach Pro-Am',           course: 'Pebble Beach Golf Links',            date: '2026-02-05' },
  { name: 'WM Phoenix Open',                    course: 'TPC Scottsdale',                     date: '2026-02-12' },
  { name: 'Genesis Invitational',               course: 'Riviera Country Club',               date: '2026-02-19' },
  { name: 'Puerto Rico Open',                   course: 'Grand Reserve Country Club',         date: '2026-02-26' },
  { name: 'Mexico Open at Vidanta',             course: 'Vidanta Vallarta',                   date: '2026-02-26' },
  { name: 'Cognizant Classic in The Palm Beaches', course: 'PGA National Resort',             date: '2026-02-26' },
  { name: 'Arnold Palmer Invitational',         course: 'Bay Hill Club & Lodge',              date: '2026-03-05' },
  { name: 'THE PLAYERS Championship',           course: 'TPC Sawgrass',                       date: '2026-03-12' },
  { name: 'Valspar Championship',               course: 'Innisbrook Resort (Copperhead)',      date: '2026-03-19' },
  { name: 'Texas Children\'s Houston Open',     course: 'Memorial Park Golf Course',          date: '2026-03-26' },
  { name: 'Valero Texas Open',                  course: 'TPC San Antonio (Oaks)',             date: '2026-04-02' },
  { name: 'Masters Tournament',                 course: 'Augusta National Golf Club',         date: '2026-04-09' },
  { name: 'RBC Heritage',                       course: 'Harbour Town Golf Links',            date: '2026-04-16' },
  { name: 'Zurich Classic of New Orleans',      course: 'TPC Louisiana',                      date: '2026-04-23' },
  { name: 'Myrtle Beach Classic',               course: 'Dunes Golf and Beach Club',          date: '2026-04-30' },
  { name: 'Wells Fargo Championship',           course: 'Quail Hollow Club',                  date: '2026-05-07' },
  { name: 'AT&T Byron Nelson',                  course: 'TPC Craig Ranch',                    date: '2026-05-14' },
  { name: 'PGA Championship',                   course: 'Aronimink Golf Club',                date: '2026-05-21' },
  { name: 'Charles Schwab Challenge',           course: 'Colonial Country Club',              date: '2026-05-28' },
  { name: 'the Memorial Tournament',            course: 'Muirfield Village Golf Club',        date: '2026-06-04' },
  { name: 'RBC Canadian Open',                  course: 'Hamilton Golf & Country Club',       date: '2026-06-11' },
  { name: 'U.S. Open',                          course: 'Oakmont Country Club',               date: '2026-06-18' },
  { name: 'Travelers Championship',             course: 'TPC River Highlands',                date: '2026-06-25' },
  { name: 'Rocket Mortgage Classic',            course: 'Detroit Golf Club',                  date: '2026-07-02' },
  { name: 'John Deere Classic',                 course: 'TPC Deere Run',                      date: '2026-07-09' },
  { name: 'The Open Championship',              course: 'Royal Portrush Golf Club',           date: '2026-07-16' },
  { name: 'Barracuda Championship',             course: 'Tahoe Mountain Club',                date: '2026-07-16' },
  { name: 'Genesis Scottish Open',              course: 'The Renaissance Club',               date: '2026-07-09' },
  { name: '3M Open',                            course: 'TPC Twin Cities',                    date: '2026-07-23' },
  { name: 'Olympic Men\'s Golf',                course: 'Real Club de Golf de Sevilla',       date: '2026-07-30' },
  { name: 'Wyndham Championship',               course: 'Sedgefield Country Club',            date: '2026-08-06' },
  { name: 'FedEx St. Jude Championship',        course: 'TPC Southwind',                      date: '2026-08-13' },
  { name: 'BMW Championship',                   course: 'Aronimink Golf Club',                date: '2026-08-20' },
  { name: 'TOUR Championship',                  course: 'East Lake Golf Club',                date: '2026-08-27' },
]

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (name: string) => void }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <h1>Fairway <span>Picks</span></h1>
          <p>PGA TOUR PICK'EM LEAGUE</p>
        </div>
        <div style={{ marginBottom: 20, color: 'var(--text-dim)', fontSize: 13, textAlign: 'center' }}>
          Who are you?
        </div>
        <div className="player-btns">
          {PLAYERS.map((name) => (
            <button key={name} className="player-btn" onClick={() => onLogin(name)}>
              <div className="player-btn-avatar">{name[0]}</div>
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'live',    icon: '⛳', label: 'Leaderboard' },
  { key: 'picks',   icon: '🏌️', label: 'Picks' },
  { key: 'money',   icon: '💰', label: 'Money' },
  { key: 'draft',   icon: '📋', label: 'Draft' },
  { key: 'history', icon: '📈', label: 'History' },
  { key: 'stats',   icon: '🏅', label: 'Stats' },
  { key: 'admin',   icon: '⚙️', label: 'Admin',   adminOnly: true },
]

function Sidebar({
  currentPlayer, tab, setTab, isAdmin, onLogout, tournament, isOpen, onClose
}: {
  currentPlayer: string
  tab: string
  setTab: (t: string) => void
  isAdmin: boolean
  onLogout: () => void
  tournament: Tournament | null
  isOpen: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            display: 'none',
            position: 'fixed', inset: 0, zIndex: 99,
            background: 'rgba(0,0,0,0.5)',
          }}
          className="sidebar-overlay"
        />
      )}
    <div className={`sidebar${isOpen ? ' open' : ''}`}>
      <button className="sidebar-close-btn" onClick={onClose} style={{ display: 'none' }}>✕</button>
      <div className="sidebar-logo">
        <h1>Fairway <span>Picks</span></h1>
        <p>PGA Tour Pick'em</p>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-label">Navigation</div>
        {NAV_ITEMS.filter(i => !i.adminOnly || isAdmin).map(item => (
          <button
            key={item.key}
            className={`nav-item ${tab === item.key ? 'active' : ''}`}
            onClick={() => { setTab(item.key); onClose() }}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}

        {tournament && (
          <>
            <div className="nav-label" style={{ marginTop: 24 }}>Active</div>
            <div className="tournament-pill" style={{ margin: '0 0 0 0', width: '100%' }}>
              <div className="live-dot" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tournament.name}
              </span>
            </div>
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">{currentPlayer[0]}</div>
          <div className="user-info">
            <div className="user-name">{currentPlayer}</div>
            <div className="user-role">{isAdmin ? 'Admin' : 'Player'}</div>
          </div>
          <button
            onClick={onLogout}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 }}
            title="Switch player"
          >↩</button>
        </div>
      </div>
    </div>
    </>
  )
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────
function LeaderboardTab({
  tournament, standings, liveData, pickMap, loading, lastUpdated, onRefresh, money
}: {
  tournament: Tournament | null
  standings: PlayerStanding[]
  liveData: GolferScore[]
  pickMap: Record<string, string[]>
  loading: boolean
  lastUpdated: Date | null
  onRefresh: () => void
  money: Record<string, number>
}) {
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
          <div className="page-sub">{tournament.course} · {tournament.date}</div>
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

      <div className="stats-row mb-24">
        <div className="stat-box">
          <div className="stat-val">{PLAYERS.length}</div>
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

      {standings.length === 0 ? (
        <div className="alert alert-gold mb-24">
          ⚡ Scores loading or draft hasn't happened yet. Go to the Draft tab to make picks.
        </div>
      ) : (
        <div className="card mb-24">
          <div className="card-header">
            <div className="card-title">Player Standings</div>
            <div className="flex gap-8">
              <span className="badge badge-gold">🏆 Low Strokes</span>
              <span className="badge badge-green">🎯 Tour Win</span>
              <span className="badge badge-indigo">🔝 Top 3</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Strokes</th>
                <th>Tour Win?</th>
                <th>Top 3?</th>
                <th>Est. $$$</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.player} className="row">
                  <td>
                    <span className={`rank rank-${s.rank}`}>
                      {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                    </span>
                  </td>
                  <td><strong>{s.player}</strong></td>
                  <td><span className={`score ${scoreClass(s.totalScore)}`}>{toRelScore(s.totalScore)}</span></td>
                  <td>{s.hasWinner ? <span className="badge badge-gold">🏆 Yes</span> : <span className="even" style={{color:'var(--text-dim)'}}>—</span>}</td>
                  <td>{s.hasTop3 ? <span className="badge badge-green">✓ Yes</span> : <span style={{color:'var(--text-dim)'}}>—</span>}</td>
                  <td>
                    <span className={`score ${money[s.player] > 0 ? 'under' : money[s.player] < 0 ? 'over' : 'even'}`}>
                      {formatMoney(money[s.player] || 0)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              {liveData.slice(0, 30).map((g, i) => {
                const pickedBy = PLAYERS.find((p) =>
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
                    <td><span className={`score ${scoreClass(g.score)}`}>{toRelScore(g.score)}</span></td>
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

function ScorecardRow({ g, par }: { g: any; par: number }) {
  const rounds: (number | null)[] = g.displayRounds ?? g.rounds ?? [null, null, null, null]
  const totalStrokes = rounds.reduce((sum: number, r: number | null) => sum + (r ?? 0), 0)
  const played = rounds.filter((r: number | null) => r !== null).length
  const totalPar = par * played

  return (
    <tr style={{ borderTop: '1px solid var(--border)' }}>
      <td style={{ padding: '11px 18px', minWidth: 160 }}>
        <div style={{ fontWeight: 500, fontSize: 13 }}>{g.name}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
          <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)' }}>#{g.position}</span>
          {g.thru !== '—' && <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)' }}>· Thru {g.thru}</span>}
          {g.status === 'cut' && <span className="badge badge-red" style={{ fontSize: 9, padding: '1px 6px' }}>CUT*</span>}
          {g.status === 'wd'  && <span className="badge badge-gray" style={{ fontSize: 9, padding: '1px 6px' }}>WD*</span>}
        </div>
      </td>
      {rounds.map((r: number | null, i: number) => {
        const roundPar = r !== null ? r - par : null
        return (
          <td key={i} style={{ padding: '11px 10px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 15, fontWeight: 500 }}>
              {r ?? '—'}
            </div>
            <div className={`score ${scoreClass(roundPar)}`} style={{ fontSize: 10, marginTop: 1 }}>
              {roundPar !== null ? toRelScore(roundPar) : ''}
            </div>
          </td>
        )
      })}
      <td style={{ padding: '11px 14px', textAlign: 'center', borderLeft: '1px solid var(--border-bright)' }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 15, fontWeight: 600 }}>
          {played > 0 ? totalStrokes : '—'}
        </div>
        <div className={`score ${scoreClass(g.score)}`} style={{ fontSize: 10, marginTop: 1 }}>
          {g.score !== null ? toRelScore(g.score) : ''}
        </div>
      </td>
    </tr>
  )
}

function PicksTab({ standings, pickMap, liveData, tournament }: {
  standings: PlayerStanding[]
  pickMap: Record<string, string[]>
  liveData: GolferScore[]
  tournament: Tournament | null
}) {
  if (!tournament) return <div className="empty-state card"><div className="empty-icon">📋</div><p>No active tournament.</p></div>
  if (Object.keys(pickMap).length === 0) return (
    <div className="empty-state card"><div className="empty-icon">🏌️</div><p>Draft hasn't happened yet.</p></div>
  )

  const par = liveData[0]?.par ?? 72

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Picks · {tournament.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>Par {par} · *CUT/WD rounds are repeated</div>
      </div>

      {PLAYERS.map((player) => {
        const playerPicks = pickMap[player] || []
        const s = standings.find((x) => x.player === player)
        if (playerPicks.length === 0) return null

        // Build golfer rows with live data merged in
        const golferRows = (s?.golfers ?? playerPicks.map((name) => {
          const g = liveData.find((d) => d.name.toLowerCase() === name.toLowerCase())
            ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active' as const, rounds: [null,null,null,null], par }
          const dr = [...(g.rounds ?? [null, null, null, null])]
          if (g.status === 'cut' || g.status === 'wd') { dr[2] = dr[0]; dr[3] = dr[1] }
          return { ...g, adjScore: g.score ?? 0, displayRounds: dr }
        })).map((g: any) => {
          // Ensure displayRounds always has cut/wd rounds repeated, regardless of source
          if (g.status === 'cut' || g.status === 'wd') {
            const dr = [...(g.displayRounds ?? g.rounds ?? [null,null,null,null])]
            dr[2] = dr[0]; dr[3] = dr[1]
            return { ...g, displayRounds: dr }
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

            {s && (s.hasWinner || s.hasTop3) && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, background: 'var(--surface2)' }}>
                {s.hasWinner && <span className="badge badge-gold">🏆 Has Tournament Winner</span>}
                {s.hasTop3   && <span className="badge badge-green">🔝 Has Top 3 Golfer</span>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Money Tab ────────────────────────────────────────────────────────────────
function MoneyTab({ seasonMoney, weekMoney, tournament, history }: {
  seasonMoney: SeasonMoney[]
  weekMoney: Record<string, number>
  tournament: Tournament | null
  history: any[]
}) {
  const sorted = [...seasonMoney].sort((a, b) => b.total - a.total)

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Money</div>
      </div>

      <div className="mb-24">
        <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 20, marginBottom: 16 }}>Season Standings</h3>
        <div className="money-grid">
          {sorted.map((sm) => {
            const v = sm.total
            return (
              <div key={sm.player_name} className="money-card">
                <div style={{ fontWeight: 600, fontSize: 15 }}>{sm.player_name}</div>
                <div className={`money-amount ${moneyClass(v)}`}>
                  {v > 0 ? '+' : ''}{v < 0 ? '-' : ''}${Math.abs(v)}
                </div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Season</div>
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
              {PLAYERS.map((p) => {
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
              🏆 Low Strokes → ${PAYOUT_RULES.lowestStrokes} × {PLAYERS.length - 1} = ${PAYOUT_RULES.lowestStrokes * (PLAYERS.length - 1)} max
              &nbsp;·&nbsp; 🎯 Tour Win → ${PAYOUT_RULES.outrightWinner} × {PLAYERS.length - 1}
              &nbsp;·&nbsp; 🔝 Top 3 → ${PAYOUT_RULES.top3} × {PLAYERS.length - 1}
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
                  {PLAYERS.map((p) => <th key={p}>{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {history.map((h: any, i: number) => (
                  <tr key={i} className="row">
                    <td>
                      <div style={{ fontWeight: 500 }}>{h.tournament_name}</div>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>{h.date}</div>
                    </td>
                    {PLAYERS.map((p) => {
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
  tournament, picks, liveData, currentPlayer, isAdmin, onPickMade
}: {
  tournament: Tournament | null
  picks: Pick[]
  liveData: GolferScore[]
  currentPlayer: string
  isAdmin: boolean
  onPickMade: (golferName: string, playerName: string) => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [draftOrder, setDraftOrder] = useState<{ player: string; pick: number; round: number }[]>([])
  const [saving, setSaving] = useState(false)

  const takenGolfers = picks.map((p) => p.golfer_name.toLowerCase())
  const pickMap = buildPickMap(picks)
  const totalPicks = PLAYERS.length * PICKS_PER_PLAYER
  const pickIndex = picks.length
  const isDraftComplete = picks.length >= totalPicks
  const currentPickPlayer = draftOrder[pickIndex]?.player

  useEffect(() => {
    if (tournament?.draft_order?.length) {
      setDraftOrder(snakeDraftOrder(tournament.draft_order, PICKS_PER_PLAYER))
    }
  }, [tournament])

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
            {PLAYERS.map((player) => {
              const playerPicks = pickMap[player] || []
              return (
                <div key={player} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {player}
                    <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>
                      {playerPicks.length}/{PICKS_PER_PLAYER}
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
  tournament, standings, weekMoney, onSetupTournament, onFinalize, onClearTournament, onClearPicks
}: {
  tournament: Tournament | null
  standings: PlayerStanding[]
  weekMoney: Record<string, number>
  onSetupTournament: (data: { name: string; course: string; date: string; draft_order: string[] }) => Promise<void>
  onFinalize: () => Promise<void>
  onClearTournament: () => Promise<void>
  onClearPicks: () => Promise<void>
}) {
  const [selectedEvent, setSelectedEvent] = useState('')
  const [draftOrderInput, setDraftOrderInput] = useState(PLAYERS.join(', '))
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [msg, setMsg] = useState('')

  const selectedTournament = PGA_SCHEDULE.find((e) => e.name === selectedEvent)

  const handleSetup = async () => {
    if (!selectedTournament) return
    setSaving(true)
    const orderArr = draftOrderInput.split(',').map((s) => s.trim()).filter(Boolean)
    await onSetupTournament({ ...selectedTournament, draft_order: orderArr })
    setSelectedEvent('')
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
                <label className="form-label">Draft Order (comma-separated)</label>
                <input className="form-input"
                  value={draftOrderInput} onChange={(e) => setDraftOrderInput(e.target.value)} />
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
                  Snake draft reverses on even rounds. First player listed picks first.
                </div>
              </div>
              <button className="btn btn-green" onClick={handleSetup} disabled={saving || !selectedTournament}>
                {saving ? '⏳ Saving…' : '⛳ Activate Tournament'}
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

          <div className="card">
            <div className="card-header"><div className="card-title">Payout Rules</div></div>
            <div className="card-body">
              {[
                ['🏆 Lowest Total Strokes', `$${PAYOUT_RULES.lowestStrokes} from each other player`],
                ['🎯 Outright Tournament Winner', `$${PAYOUT_RULES.outrightWinner} from each other player`],
                ['🔝 Top 3 Golfer (incl. ties)', `$${PAYOUT_RULES.top3} from each other player`],
                ['✂️ Cut Golfer', 'Rounds 3 & 4 score = repeat of rounds 1 & 2'],
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
function HistoryTab({ history, isAdmin, onDeleteTournament, onEditResult }: {
  history: any[]
  isAdmin: boolean
  onDeleteTournament: (tournamentId: string, moneyByPlayer: Record<string, number>) => Promise<void>
  onEditResult: (tournamentId: string, playerName: string, field: 'total_score' | 'money_won', value: number) => Promise<void>
}) {
  const [editing, setEditing] = useState<{ tid: string; player: string; field: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

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
      {history.map((h: any, i: number) => (
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
                <th>Rank</th>
                <th>Player</th>
                <th>Score</th>
                <th>Winnings</th>
              </tr>
            </thead>
            <tbody>
              {(h.standings || []).map((s: any) => {
                const moneyVal = h.money?.[s.player] || 0
                const isEditingScore = isAdmin && editing?.tid === h.tournament_id && editing?.player === s.player && editing?.field === 'total_score'
                const isEditingMoney = isAdmin && editing?.tid === h.tournament_id && editing?.player === s.player && editing?.field === 'money_won'
                return (
                  <tr key={s.player} className="row">
                    <td><span className={`rank rank-${s.rank}`}>#{s.rank}</span></td>
                    <td><strong>{s.player}</strong></td>
                    <td>
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
                    <td>
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
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────
const MAJORS_HISTORY = [
  { year: 2020, name: 'Masters',        winner: 'Chase',         logo: '🌲' },
  { year: 2020, name: 'PGA Championship', winner: 'Max',         logo: '🏆' },
  { year: 2020, name: 'US Open',        winner: 'Chase',         logo: '🦅' },
  { year: 2021, name: 'Masters',        winner: 'Chase',         logo: '🌲' },
  { year: 2021, name: 'PGA Championship', winner: 'Hayden',      logo: '🏆' },
  { year: 2021, name: 'US Open',        winner: 'Chase',         logo: '🦅' },
  { year: 2021, name: 'The Open',       winner: 'Chase',         logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { year: 2022, name: 'Masters',        winner: 'Chase',         logo: '🌲' },
  { year: 2022, name: 'PGA Championship', winner: 'Hayden',      logo: '🏆' },
  { year: 2022, name: 'US Open',        winner: 'Chase',         logo: '🦅' },
  { year: 2022, name: 'The Open',       winner: 'Chase',         logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { year: 2023, name: 'Masters',        winner: 'JHall',         logo: '🌲' },
  { year: 2023, name: 'PGA Championship', winner: 'Andrew',      logo: '🏆' },
  { year: 2023, name: 'US Open',        winner: 'Brennan',       logo: '🦅' },
  { year: 2023, name: 'The Open',       winner: 'Brennan/Hayden (Tie)', logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { year: 2024, name: 'Masters',        winner: 'Brennan',       logo: '🌲' },
  { year: 2024, name: 'PGA Championship', winner: 'Max',         logo: '🏆' },
  { year: 2024, name: 'US Open',        winner: 'Andrew',        logo: '🦅' },
  { year: 2024, name: 'The Open',       winner: 'Max',           logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
  { year: 2025, name: 'Masters',        winner: 'Andrew',        logo: '🌲' },
  { year: 2025, name: 'PGA Championship', winner: 'Max',         logo: '🏆' },
  { year: 2025, name: 'US Open',        winner: 'Max',           logo: '🦅' },
  { year: 2025, name: 'The Open',       winner: 'Max',           logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
]

const MAJOR_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  'Masters':          { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.3)',  text: '#4ade80', label: 'Masters' },
  'PGA Championship': { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b', label: 'PGA' },
  'US Open':          { bg: 'rgba(99,179,237,0.10)', border: 'rgba(99,179,237,0.3)', text: '#60a5fa', label: 'US Open' },
  'The Open':         { bg: 'rgba(192,132,252,0.10)',border: 'rgba(192,132,252,0.3)',text: '#c084fc', label: 'The Open' },
}

const ALL_STATS = [
  { player: 'Chase',   first: 19, second: 25, third: 26, majors: 8,   winners: 10, top3: 18, cut: 68 },
  { player: 'Max',     first: 33, second: 23, third: 22, majors: 6,   winners: 15, top3: 28, cut: 50 },
  { player: 'Hayden',  first: 28, second: 26, third: 30, majors: 2.5, winners: 12, top3: 24, cut: 65 },
  { player: 'Andrew',  first: 18, second: 27, third: 14, majors: 2,   winners: 14, top3: 22, cut: 61 },
  { player: 'Brennan', first: 13, second: 7,  third: 7,  majors: 2.5, winners: 6,  top3: 9,  cut: 19 },
  { player: 'Eric',    first: 1,  second: 0,  third: 0,  majors: 0,   winners: 0,  top3: 0,  cut: 0  },
]

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-mid)', width: 28, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function StatsTab() {
  const [activeYear, setActiveYear] = useState<number | 'all'>('all')
  const years = [2020, 2021, 2022, 2023, 2024, 2025]
  const filteredMajors = activeYear === 'all' ? MAJORS_HISTORY : MAJORS_HISTORY.filter(m => m.year === activeYear)

  const maxFirst   = Math.max(...ALL_STATS.map(s => s.first))
  const maxSecond  = Math.max(...ALL_STATS.map(s => s.second))
  const maxThird   = Math.max(...ALL_STATS.map(s => s.third))
  const maxWinners = Math.max(...ALL_STATS.map(s => s.winners))
  const maxTop3    = Math.max(...ALL_STATS.map(s => s.top3))
  const maxCut     = Math.max(...ALL_STATS.map(s => s.cut))
  const maxMajors  = Math.max(...ALL_STATS.map(s => s.majors))

  // Major wins per player
  const majorsByPlayer: Record<string, number> = {}
  PLAYERS.forEach(p => majorsByPlayer[p] = 0)
  MAJORS_HISTORY.forEach(m => {
    for (const p of PLAYERS) {
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
          { label: 'Tournaments', val: ALL_STATS[0].first + ALL_STATS[0].second + ALL_STATS[0].third, color: 'var(--gold)' },
          { label: 'Majors Tracked', val: MAJORS_HISTORY.length, color: '#c084fc' },
          { label: 'Total Cuts', val: ALL_STATS.reduce((s,p)=>s+p.cut,0), color: 'var(--red)' },
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
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Player','🥇 1st','🥈 2nd','🥉 3rd','🏆 Majors','🎯 Winners','🔝 Top 3 (no W)','✂️ Cuts'].map((h, i) => (
                  <th key={i} style={{ padding: '8px 16px', textAlign: i === 0 ? 'left' : 'center', fontFamily: 'DM Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_STATS.map((s, i) => (
                <tr key={s.player} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="user-avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{s.player[0]}</div>
                      <span style={{ fontWeight: 600 }}>{s.player}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <StatBar value={s.first} max={maxFirst} color="var(--gold)" />
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatBar value={s.second} max={maxSecond} color="#c0c0c0" />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatBar value={s.third} max={maxThird} color="#cd7f32" />
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'DM Mono', fontSize: 15, fontWeight: 700, color: '#c084fc' }}>{s.majors || '—'}</span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatBar value={s.winners} max={maxWinners} color="var(--green)" />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatBar value={s.top3} max={maxTop3} color="var(--indigo)" />
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <StatBar value={s.cut} max={maxCut} color="var(--red)" />
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
        <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {filteredMajors.map((m, i) => {
            const style = MAJOR_COLORS[m.name] ?? MAJOR_COLORS['The Open']
            return (
              <div key={i} style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: 10,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{m.logo}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontFamily: 'DM Mono', textTransform: 'uppercase', letterSpacing: '0.08em', color: style.text, marginBottom: 2 }}>
                    {m.year} · {m.name}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.winner}
                  </div>
                </div>
                <div style={{
                  marginLeft: 'auto', width: 28, height: 28, borderRadius: '50%',
                  background: style.border, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700, fontSize: 12, color: style.text, flexShrink: 0
                }}>
                  {m.winner[0]}
                </div>
              </div>
            )
          })}
        </div>

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
            {ALL_STATS.map(s => (
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
            {[...ALL_STATS].sort((a,b) => b.cut - a.cut).map(s => (
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
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const supabase = createClient()
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null)
  const [tab, setTab] = useState('live')
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [liveData, setLiveData] = useState<GolferScore[]>([])
  const [seasonMoney, setSeasonMoney] = useState<SeasonMoney[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)

  const isAdmin = ['Eric', 'Chase'].includes(currentPlayer ?? '')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── Load from localStorage on mount ──
  useEffect(() => {
    const saved = localStorage.getItem('fairway_player')
    if (saved) setCurrentPlayer(saved)
    setBootstrapped(true)
  }, [])

  // ── Fetch DB data when logged in ──
  const loadData = useCallback(async () => {
    const [{ data: t }, { data: sm }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('status', 'active').single(),
      supabase.from('season_money').select('*'),
    ])
    if (sm) setSeasonMoney(sm)

    // Only load picks for the active tournament
    if (t) {
      setTournament(t)
      const { data: p } = await supabase
        .from('picks').select('*')
        .eq('tournament_id', t.id)
        .order('pick_order')
      if (p) setPicks(p)
      else setPicks([])
    } else {
      setTournament(null)
      setPicks([])
    }

    // Load history: join results + tournaments
    const { data: results } = await supabase
      .from('results')
      .select('*, tournaments(name, date)')
      .order('created_at', { ascending: false })

    if (results) {
      // Group by tournament
      const grouped: Record<string, any> = {}
      for (const r of results) {
        const tid = r.tournament_id
        if (!grouped[tid]) {
          grouped[tid] = {
            tournament_id: tid,
            tournament_name: r.tournaments?.name,
            date: r.tournaments?.date,
            standings: [],
            money: {},
          }
        }
        grouped[tid].standings.push({ player: r.player_name, score: r.total_score, rank: r.rank })
        grouped[tid].money[r.player_name] = r.money_won
      }
      setHistory(Object.values(grouped))
    }
  }, [])

  useEffect(() => {
    if (currentPlayer) loadData()
  }, [currentPlayer, loadData])

  // ── Live score polling ──
  const fetchScores = useCallback(async () => {
    if (!tournament) return
    setLoading(true)
    try {
      const res = await fetch('/api/scores')
      const data: GolferScore[] = await res.json()
      setLiveData(data)
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
  const pickMap = buildPickMap(picks)
  const standings = computeStandings(liveData, pickMap)
  const weekMoney = computeMoney(standings)

  // ── Handlers ──
  const handleLogin = (name: string) => {
    setCurrentPlayer(name)
    localStorage.setItem('fairway_player', name)
  }

  const handleLogout = () => {
    setCurrentPlayer(null)
    localStorage.removeItem('fairway_player')
    setTab('live')
  }

  const handleSetupTournament = async (data: { name: string; course: string; date: string; draft_order: string[] }) => {
    // Get current active tournament so we can clear its picks
    const { data: oldT } = await supabase.from('tournaments').select('id').eq('status', 'active').single()
    if (oldT) {
      await supabase.from('picks').delete().eq('tournament_id', oldT.id)
      await supabase.from('tournaments').update({ status: 'finalized' }).eq('id', oldT.id)
    }
    const { data: t } = await supabase.from('tournaments').insert({ ...data, status: 'active' }).select().single()
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
    const money = weekMoney

    // Insert results
    const resultRows = standings.map((s) => ({
      tournament_id: tournament.id,
      player_name: s.player,
      total_score: s.totalScore,
      rank: s.rank,
      has_winner: s.hasWinner,
      has_top3: s.hasTop3,
      money_won: money[s.player] || 0,
    }))
    await supabase.from('results').upsert(resultRows, { onConflict: 'tournament_id,player_name' })

    // Update season money
    for (const player of PLAYERS) {
      const delta = money[player] || 0
      const current = seasonMoney.find((sm) => sm.player_name === player)?.total || 0
      await supabase.from('season_money').upsert({
        player_name: player,
        total: current + delta,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'player_name' })
    }

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

  const handleDeleteTournament = async (tournamentId: string, moneyByPlayer: Record<string, number>) => {
    // Reverse season money for this tournament
    for (const player of PLAYERS) {
      const delta = moneyByPlayer[player] || 0
      if (delta === 0) continue
      const current = seasonMoney.find((sm) => sm.player_name === player)?.total || 0
      await supabase.from('season_money').upsert({
        player_name: player,
        total: current - delta,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'player_name' })
    }
    // Delete results and tournament (picks cascade-delete)
    await supabase.from('results').delete().eq('tournament_id', tournamentId)
    await supabase.from('tournaments').delete().eq('id', tournamentId)
    await loadData()
  }

  const handleEditResult = async (tournamentId: string, playerName: string, field: 'total_score' | 'money_won', value: number) => {
    await supabase.from('results')
      .update({ [field]: value })
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)

    // If editing money_won, recalculate season totals from scratch
    if (field === 'money_won') {
      const { data: allResults } = await supabase.from('results').select('player_name, money_won')
      if (allResults) {
        const totals: Record<string, number> = {}
        PLAYERS.forEach(p => totals[p] = 0)
        for (const r of allResults) { totals[r.player_name] = (totals[r.player_name] || 0) + (r.money_won || 0) }
        for (const player of PLAYERS) {
          await supabase.from('season_money').upsert({
            player_name: player,
            total: totals[player],
            updated_at: new Date().toISOString(),
          }, { onConflict: 'player_name' })
        }
      }
    }
    await loadData()
  }

  if (!bootstrapped) return <div className="loading-screen"><div className="spin" style={{ fontSize: 32 }}>⛳</div>Loading…</div>
  if (!currentPlayer) return <LoginScreen onLogin={handleLogin} />

  return (
    <div className="app-shell">
      {/* Hamburger button — mobile only */}
      <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
        <span /><span /><span />
      </button>
      <Sidebar
        currentPlayer={currentPlayer}
        tab={tab}
        setTab={setTab}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        tournament={tournament}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main-content">
        {tab === 'live'    && <LeaderboardTab tournament={tournament} standings={standings} liveData={liveData} pickMap={pickMap} loading={loading} lastUpdated={lastUpdated} onRefresh={fetchScores} money={weekMoney} />}
        {tab === 'picks'   && <PicksTab standings={standings} pickMap={pickMap} liveData={liveData} tournament={tournament} />}
        {tab === 'money'   && <MoneyTab seasonMoney={seasonMoney} weekMoney={weekMoney} tournament={tournament} history={history} />}
        {tab === 'draft'   && <DraftTab tournament={tournament} picks={picks} liveData={liveData} currentPlayer={currentPlayer} isAdmin={isAdmin} onPickMade={handlePickMade} />}
        {tab === 'history' && <HistoryTab history={history} isAdmin={isAdmin} onDeleteTournament={handleDeleteTournament} onEditResult={handleEditResult} />}
        {tab === 'stats'   && <StatsTab />}
        {tab === 'admin'   && isAdmin && <AdminTab tournament={tournament} standings={standings} weekMoney={weekMoney} onSetupTournament={handleSetupTournament} onFinalize={handleFinalize} onClearTournament={handleClearTournament} onClearPicks={handleClearPicks} />}
      </main>
    </div>
  )
}
