'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
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

// ─── Skeleton Screen ─────────────────────────────────────────────────────────
function SkeletonScreen() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <div className="skeleton skeleton-title" style={{ width: 280 }} />
          <div className="skeleton skeleton-text" style={{ width: 180 }} />
        </div>
      </div>
      <div className="stats-row mb-24">
        {[1,2,3,4].map(i => <div key={i} className="skeleton skeleton-stat" />)}
      </div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" style={{ height: 320 }} />
    </div>
  )
}

// ─── Animated Money Counter ───────────────────────────────────────────────────
function AnimatedMoney({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [displayed, setDisplayed] = useState(0)
  const [key, setKey] = useState(0)
  const prevRef = React.useRef(0)

  useEffect(() => {
    if (value === prevRef.current) return
    const start = prevRef.current
    const end = value
    const duration = 700
    const startTime = performance.now()
    prevRef.current = end
    setKey(k => k + 1)

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(start + (end - start) * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])

  const formatted = displayed === 0 ? '$0' : displayed > 0 ? `+$${displayed}` : `-$${Math.abs(displayed)}`
  return (
    <span key={key} className={`count-up ${className || ''}`} style={style}>
      {formatted}
    </span>
  )
}

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
  { key: 'recap',   icon: '🏆', label: 'Season Recap' },
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

// ─── Expandable Player Card ───────────────────────────────────────────────────
function ExpandablePlayerCard({
  standing, liveData, par
}: {
  standing: PlayerStanding
  liveData: GolferScore[]
  par: number
}) {
  const [expanded, setExpanded] = useState(false)

  const golfers = standing.golfers.map((g: any) => {
    const liveG = liveData.find(d => d.name.toLowerCase() === g.name.toLowerCase())
    return liveG || g
  })

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'all 0.15s',
          fontFamily: 'Sora, sans-serif'
        }}
        className="expandable-player-btn"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
            {standing.player[0]}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{standing.player}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>
              {golfers.length} golfers
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className={`score ${scoreClass(standing.totalScore)}`} style={{ fontSize: 18, fontFamily: 'DM Mono', fontWeight: 700 }}>
            {toRelScore(standing.totalScore)}
          </div>
          <span style={{ fontSize: 16, color: 'var(--text-dim)', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        </div>
      </button>

      {expanded && (
        <div style={{ 
          marginTop: 8, 
          padding: 16, 
          background: 'var(--surface)', 
          border: '1px solid var(--border)', 
          borderRadius: 'var(--radius-sm)',
          animation: 'slideDown 0.2s ease-out'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    Golfer
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    R1
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    R2
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    R3
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    R4
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {golfers.map((g: any) => {
                  const rounds = g.displayRounds || g.rounds || [null, null, null, null]
                  return (
                    <tr key={g.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{g.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono', marginTop: 2 }}>
                          #{g.position}
                          {g.status === 'cut' && <span style={{ marginLeft: 6, color: 'var(--red)' }}>CUT</span>}
                          {g.status === 'wd' && <span style={{ marginLeft: 6, color: 'var(--text-dim)' }}>WD</span>}
                        </div>
                      </td>
                      {rounds.map((r: number | null, i: number) => {
                        const toPar = r !== null ? r - par : null
                        return (
                          <td key={i} style={{ padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'DM Mono', fontSize: 14, fontWeight: 500 }}>
                              {r ?? '—'}
                            </div>
                            <div className={`score ${scoreClass(toPar)}`} style={{ fontSize: 9, marginTop: 1 }}>
                              {toPar !== null ? toRelScore(toPar) : ''}
                            </div>
                          </td>
                        )
                      })}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div className={`score ${scoreClass(g.score)}`} style={{ fontSize: 16, fontFamily: 'DM Mono', fontWeight: 700 }}>
                          {toRelScore(g.score)}
                        </div>
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

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────
function LeaderboardTab({
  tournament, standings, liveData, pickMap, loading, lastUpdated, onRefresh, money, flashMap
}: {
  tournament: Tournament | null
  standings: PlayerStanding[]
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
        const roundsPlayed = liveData.length > 0
          ? Math.max(...liveData.map(g => {
              const r = g.rounds || []
              return r.filter((v: any) => v !== null).length
            }))
          : 0
        const currentRound = allFinished ? Math.min(roundsPlayed, 4) : Math.max(roundsPlayed, 1)
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

      {/* ── Live Alerts ── */}
      {standings.length > 0 && (() => {
        const alerts: { type: 'lead' | 'top3' | 'cut'; msg: string }[] = []

        // Check each player's golfers for notable positions
        for (const s of standings) {
          for (const g of s.golfers) {
            const pos = parseInt((g.position || '').replace(/^T/, ''))
            if (pos === 1) alerts.push({ type: 'lead', msg: `🏆 ${g.name} (${s.player}'s pick) is leading the tournament!` })
            else if (!isNaN(pos) && pos <= 3) alerts.push({ type: 'top3', msg: `🔝 ${g.name} (${s.player}'s pick) is T${pos} — top 3!` })
          }
        }

        // Cut line: golfers within 1 shot of the cut
        const activeLiveGolfers = liveData.filter(g => g.status === 'active' && g.score !== null)
        if (activeLiveGolfers.length > 20) {
          const sorted = [...activeLiveGolfers].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
          const cutIdx = Math.floor(sorted.length * 0.65)
          const cutScore = sorted[cutIdx]?.score ?? 0
          for (const s of standings) {
            for (const g of s.golfers) {
              if (g.status === 'active' && g.score !== null && g.thru !== 'F') {
                const diff = (g.score ?? 0) - cutScore
                if (diff >= 0 && diff <= 2) {
                  alerts.push({ type: 'cut', msg: `✂️ ${g.name} (${s.player}'s pick) is on the cut line (${toRelScore(g.score)})` })
                }
              }
            }
          }
        }

        if (alerts.length === 0) return null
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {alerts.map((a, i) => (
              <div key={i} className={`alert ${a.type === 'lead' ? 'alert-gold' : a.type === 'top3' ? 'alert-green' : 'alert-red'}`}>
                {a.msg}
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Projected Final Standings ── */}
      {standings.length > 0 && (() => {
        // Only show projection if tournament is in progress (some golfers have played but not finished)
        const inProgress = liveData.some(g => g.thru !== 'F' && g.thru !== '—' && g.thru !== 'CUT' && g.score !== null)
        if (!inProgress) return null

        // Project each golfer's final score based on current pace
        const projectScore = (g: any): number => {
          if (g.score === null) return 0
          if (g.thru === 'F') return g.score
          if (g.status === 'cut' || g.status === 'wd') return g.adjScore ?? g.score * 2
          const thruHoles = parseInt(g.thru) || 18
          if (thruHoles === 0) return g.score
          const pace = (g.score ?? 0) / thruHoles
          const remaining = (72 - thruHoles) / 18  // rounds remaining approx
          return Math.round(g.score + pace * remaining * 18)
        }

        const projectedStandings = standings.map(s => {
          const projTotal = s.golfers.reduce((sum: number, g: any) => sum + projectScore(g), 0)
          return { player: s.player, projTotal }
        }).sort((a, b) => a.projTotal - b.projTotal)

        return (
          <div className="card mb-24">
            <div className="card-header">
              <div className="card-title">Projected Final Standings</div>
              <span className="badge badge-indigo">📊 Pace-based estimate</span>
            </div>
            <table className="table">
              <thead><tr><th>Proj. Rank</th><th>Player</th><th>Proj. Score</th><th>vs Current</th></tr></thead>
              <tbody>
                {projectedStandings.map((p, i) => {
                  const current = standings.find(s => s.player === p.player)
                  const diff = p.projTotal - (current?.totalScore ?? 0)
                  return (
                    <tr key={p.player} className="row">
                      <td><span className={`rank rank-${i + 1}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span></td>
                      <td><strong>{p.player}</strong></td>
                      <td><span className={`score ${scoreClass(p.projTotal)}`}>{toRelScore(p.projTotal)}</span></td>
                      <td><span style={{ fontFamily: 'DM Mono', fontSize: 12, color: diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--text-dim)' }}>{diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '—'}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}

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
              <ExpandablePlayerCard key={s.player} standing={s} liveData={safeData} par={par} />
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

function ScorecardRow({ g, par }: { g: any; par: number }) {
  const isCut = g.status === 'cut' || g.status === 'wd'
  const isWD  = g.status === 'wd'
  const isWinner = g.position === '1' || g.position === 'T1'
  const isTop3 = !isNaN(parseInt(g.position.replace(/^T/i, ''))) && parseInt(g.position.replace(/^T/i, '')) <= 3
  const getPositionClass = (pos: string) => {
    const numPos = parseInt(pos.replace(/^T/i, ''))
    if (isNaN(numPos)) return ''
    if (numPos <= 10) return 'top10'
    if (numPos <= 20) return 'top20'
    return ''
  }
  const posClass = getPositionClass(g.position)
  const rounds: (number | null)[] = g.displayRounds ?? g.rounds ?? [null, null, null, null]
  const totalStrokes = rounds.reduce((sum: number, r: number | null) => sum + (r ?? 0), 0)
  const played = rounds.filter((r: number | null) => r !== null).length

  return (
    <tr style={{ borderTop: '1px solid var(--border)', background: isCut ? 'rgba(248,113,113,0.04)' : 'transparent' }}>
      <td style={{ padding: '11px 18px', minWidth: 160 }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: isCut ? 'var(--text-mid)' : 'var(--text)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {g.name}
          {isWinner && <span className="golfer-inline-badge winner">🏆</span>}
          {!isWinner && isTop3 && <span className="golfer-inline-badge top3">🔝</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center' }}>
          <span className={`position-badge ${posClass}`}>#{g.position}</span>
          {isCut && !isWD && <span className="badge badge-red" style={{ fontSize: 9, padding: '2px 7px', letterSpacing: '0.05em' }}>✂ CUT</span>}
          {isWD           && <span className="badge badge-gray" style={{ fontSize: 9, padding: '2px 7px' }}>WD</span>}
          {!isCut && g.thru && g.thru !== '—' && g.thru !== 'F' && (
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)' }}>· Thru {g.thru}</span>
          )}
          {!isCut && g.thru === 'F' && (
            <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--green)' }}>· F</span>
          )}
        </div>
        {isCut && (
          <div style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'DM Mono', marginTop: 3, opacity: 0.7 }}>
            R3 & R4 = avg of R1+R2
          </div>
        )}
      </td>
      {rounds.map((r: number | null, i: number) => {
        const isMirrored = isCut && (i === 2 || i === 3)
        const roundPar = r !== null ? r - par : null
        return (
          <td key={i} style={{
            padding: '11px 10px', textAlign: 'center', borderLeft: '1px solid var(--border)',
            background: isMirrored ? 'rgba(248,113,113,0.06)' : 'transparent',
          }}>
            <div style={{
              fontFamily: 'DM Mono', fontSize: 15, fontWeight: 500,
              color: isMirrored ? 'var(--text-dim)' : 'var(--text)',
              fontStyle: isMirrored ? 'italic' : 'normal',
            }}>
              {r ?? '—'}
            </div>
            <div className={`score ${scoreClass(roundPar)}`} style={{ fontSize: 10, marginTop: 1, opacity: isMirrored ? 0.6 : 1 }}>
              {roundPar !== null ? toRelScore(roundPar) : ''}
            </div>
          </td>
        )
      })}
      <td style={{ padding: '11px 14px', textAlign: 'center', borderLeft: '1px solid var(--border-bright)' }}>
        <div style={{ fontFamily: 'DM Mono', fontSize: 15, fontWeight: 600, color: isCut ? 'var(--text-mid)' : 'var(--text)' }}>
          {played > 0 ? totalStrokes : '—'}
        </div>
        <div className={`score ${scoreClass(g.adjScore ?? g.score)}`} style={{ fontSize: 10, marginTop: 1 }}>
          {(g.adjScore ?? g.score) !== null ? toRelScore(g.adjScore ?? g.score) : ''}
        </div>
        {isCut && (
          <div style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'DM Mono', marginTop: 2, opacity: 0.7 }}>×2 penalty</div>
        )}
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
        <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>Par {par} · *CUT/WD rounds use avg of R1+R2</div>
      </div>

      {PLAYERS.map((player) => {
        const playerPicks = pickMap[player] || []
        const s = standings.find((x) => x.player === player)
        if (playerPicks.length === 0) return null

        // Build golfer rows — scoring.ts already stamps status/displayRounds correctly
        const golferRows = (s?.golfers ?? playerPicks.map((name) => {
          const g = liveData.find((d) => d.name.toLowerCase() === name.toLowerCase())
            ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active' as const, rounds: [null,null,null,null], par }
          const dr = [...(g.rounds ?? [null, null, null, null])]
          const isCut = g.status === 'cut' || g.status === 'wd'
          if (isCut) { dr[2] = dr[0]; dr[3] = dr[1] }
          return { ...g, adjScore: g.score ?? 0, displayRounds: dr }
        }))

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
          {sorted.map((sm, i) => {
            const v = sm.total
            return (
              <div key={sm.player_name} className={`money-card ${i === 0 ? 'gradient-card-gold leader-glow' : i === 1 ? 'gradient-card-green' : i === 2 ? 'gradient-card-indigo' : ''}`}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{sm.player_name}</div>
                <AnimatedMoney value={v} className={`money-amount ${moneyClass(v)}`} />
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
  onSetupTournament: (data: { name: string; course: string; date: string; draft_order: string[]; is_major: boolean }) => Promise<void>
  onFinalize: () => Promise<void>
  onClearTournament: () => Promise<void>
  onClearPicks: () => Promise<void>
}) {
  const [selectedEvent, setSelectedEvent] = useState('')
  const [participants, setParticipants] = useState<string[]>(PLAYERS)
  const [isMajor, setIsMajor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [msg, setMsg] = useState('')

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
                <label className="form-label">Participants & Draft Order</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {PLAYERS.map((p, idx) => {
                    const checked = participants.includes(p)
                    const order = participants.indexOf(p)
                    return (
                      <div key={p} onClick={() => toggleParticipant(p)} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                        background: checked ? 'var(--green-dim)' : 'var(--surface2)',
                        border: `1px solid ${checked ? 'rgba(74,222,128,0.25)' : 'var(--border)'}`,
                        transition: 'all 0.15s',
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `2px solid ${checked ? 'var(--green)' : 'var(--border-bright)'}`,
                          background: checked ? 'var(--green)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {checked && <span style={{ color: '#0a0c0f', fontSize: 11, fontWeight: 900 }}>✓</span>}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 14, color: checked ? 'var(--green)' : 'var(--text-dim)', flex: 1 }}>{p}</span>
                        {checked && (
                          <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>
                            Pick #{order + 1}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                  Check order = draft order. Snake draft reverses on even rounds.
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

          <div className="card">
            <div className="card-header"><div className="card-title">Payout Rules</div></div>
            <div className="card-body">
              {[
                ['🏆 Lowest Total Strokes', `$${PAYOUT_RULES.lowestStrokes} from each other player`],
                ['🎯 Outright Tournament Winner', `$${PAYOUT_RULES.outrightWinner} from each other player`],
                ['🔝 Top 3 Golfer (incl. ties)', `$${PAYOUT_RULES.top3} from each other player`],
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
function HistoryTab({ history, golferHistory, isAdmin, onDeleteTournament, onEditResult, onDeleteResult }: {
  history: any[]
  golferHistory: any[]
  isAdmin: boolean
  onDeleteTournament: (tournamentId: string, moneyByPlayer: Record<string, number>) => Promise<void>
  onEditResult: (tournamentId: string, playerName: string, field: 'total_score' | 'money_won', value: number) => Promise<void>
  onDeleteResult: (tournamentId: string, playerName: string, moneyWon: number) => Promise<void>
}) {
  const [editing, setEditing] = useState<{ tid: string; player: string; field: string } | null>(null)
  const [editVal, setEditVal] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [subtab, setSubtab] = useState<'tournaments' | 'golfers'>('tournaments')
  const [selectedPlayer, setSelectedPlayer] = useState<string>(PLAYERS[0])

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
            {PLAYERS.map(p => (
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
                <th>Rank</th>
                <th>Player</th>
                <th>Score</th>
                <th>Winnings</th>
                {isAdmin && <th></th>}
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
                    {isAdmin && (
                      <td>
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
                )
              })}
            </tbody>
          </table>
          </div>

          {/* ── Net Payout Breakdown ── */}
          {(() => {
            const money = h.money || {}

            // Build gross debts between every pair: who owes who what gross amount
            // net[A][B] = net amount A owes B (can go negative meaning B owes A)
            const net: Record<string, Record<string, number>> = {}
            PLAYERS.forEach(a => { net[a] = {}; PLAYERS.forEach(b => { net[a][b] = 0 }) })

            const standings = h.standings || []
            const strokeWinner = [...standings].sort((a: any, b: any) => a.score - b.score)[0]
            const tourWinners = standings.filter((s: any) => s.has_winner)
            const top3Players = standings.filter((s: any) => s.has_top3)

            if (strokeWinner) {
              PLAYERS.filter(p => p !== strokeWinner.player).forEach(p => {
                net[p][strokeWinner.player] += PAYOUT_RULES.lowestStrokes
              })
            }
            tourWinners.forEach((w: any) => {
              PLAYERS.filter(p => p !== w.player).forEach(p => {
                net[p][w.player] += PAYOUT_RULES.outrightWinner
              })
            })
            top3Players.forEach((w: any) => {
              PLAYERS.filter(p => p !== w.player).forEach(p => {
                net[p][w.player] += PAYOUT_RULES.top3
              })
            })

            // Collapse to net: for each pair only keep the net direction
            const netPayments: { from: string; to: string; amount: number }[] = []
            const seen = new Set<string>()
            PLAYERS.forEach(a => {
              PLAYERS.forEach(b => {
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
  'Masters':          { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.35)', text: '#f59e0b', label: 'Masters' },
  'PGA Championship': { bg: 'rgba(99,179,237,0.08)',  border: 'rgba(99,179,237,0.3)',  text: '#60a5fa', label: 'PGA' },
  'US Open':          { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.3)', text: '#f87171', label: 'US Open' },
  'The Open':         { bg: 'rgba(192,132,252,0.08)', border: 'rgba(192,132,252,0.3)', text: '#c084fc', label: 'The Open' },
}

const ALL_STATS = [
  { player: 'Chase',   first: 19, second: 25, third: 26, majors: 8,   winners: 10, top3: 18, cut: 68 },
  { player: 'Max',     first: 33, second: 23, third: 22, majors: 6,   winners: 15, top3: 28, cut: 50 },
  { player: 'Hayden',  first: 28, second: 26, third: 30, majors: 2.5, winners: 12, top3: 24, cut: 65 },
  { player: 'Andrew',  first: 18, second: 27, third: 14, majors: 2,   winners: 14, top3: 22, cut: 61 },
  { player: 'Brennan', first: 13, second: 7,  third: 7,  majors: 2.5, winners: 6,  top3: 9,  cut: 19 },
  { player: 'Eric',    first: 0,  second: 0,  third: 0,  majors: 0,   winners: 0,  top3: 0,  cut: 0  },
]

function StatsTab({ history }: { history: any[] }) {
  const [activeYear, setActiveYear] = useState<number | 'all'>('all')

  // ── Merge hardcoded baseline + live Supabase results ──
  // Live results come from finalized tournaments stored in DB (2026+)
  const liveStatsByPlayer: Record<string, { first: number; second: number; third: number; winners: number; top3: number; cut: number; majors: number }> = {}
  PLAYERS.forEach(p => liveStatsByPlayer[p] = { first: 0, second: 0, third: 0, winners: 0, top3: 0, cut: 0, majors: 0 })

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
      for (const p of PLAYERS) {
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
  PLAYERS.forEach(p => majorsByPlayer[p] = 0)
  allMajors.forEach(m => {
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
        PLAYERS.forEach(a => {
          h2h[a] = {}
          PLAYERS.forEach(b => { if (a !== b) h2h[a][b] = { wins: 0, losses: 0 } })
        })

        for (const tournament of history) {
          const standings = tournament.standings || []
          for (let i = 0; i < PLAYERS.length; i++) {
            for (let j = i + 1; j < PLAYERS.length; j++) {
              const a = PLAYERS[i], b = PLAYERS[j]
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
                    {PLAYERS.map(p => (
                      <th key={p} style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{p}</th>
                    ))}
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontFamily: 'DM Mono', fontSize: 10, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {PLAYERS.map((a, ai) => {
                    const totalWins = PLAYERS.filter(b => b !== a).reduce((s, b) => s + h2h[a][b].wins, 0)
                    const totalGames = PLAYERS.filter(b => b !== a).reduce((s, b) => s + h2h[a][b].wins + h2h[a][b].losses, 0)
                    return (
                      <tr key={a} style={{ borderTop: '1px solid var(--border)', background: ai % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>{a}</td>
                        {PLAYERS.map(b => {
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
        PLAYERS.forEach(p => runningTotals[p] = [])
        const sortedByDate = [...moneyByTournament].sort((a, b) => a.date?.localeCompare(b.date))
        let cumulative: Record<string, number> = {}
        PLAYERS.forEach(p => cumulative[p] = 0)
        for (const t of sortedByDate) {
          PLAYERS.forEach(p => {
            cumulative[p] = (cumulative[p] || 0) + (t.money[p] || 0)
            runningTotals[p].push(cumulative[p])
          })
        }

        // Find closest pairs: smallest average gap in running totals
        const rivals: { a: string; b: string; avgGap: number; currentGap: number }[] = []
        for (let i = 0; i < PLAYERS.length; i++) {
          for (let j = i + 1; j < PLAYERS.length; j++) {
            const a = PLAYERS[i], b = PLAYERS[j]
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
function SeasonRecapTab({ history, golferHistory, seasonMoney }: {
  history: any[]
  golferHistory: any[]
  seasonMoney: SeasonMoney[]
}) {
  if (history.length === 0) return (
    <div className="empty-state card">
      <div className="empty-icon">🏆</div>
      <p>No tournaments finalized yet. Come back after your first tournament!</p>
    </div>
  )

  const sorted = [...seasonMoney].sort((a, b) => b.total - a.total)
  const leader = sorted[0]
  const mostTournaments = history.length

  // Best single week per player
  const bestWeek: Record<string, { amount: number; tournament: string }> = {}
  const worstWeek: Record<string, { amount: number; tournament: string }> = {}
  PLAYERS.forEach(p => {
    bestWeek[p] = { amount: -Infinity, tournament: '—' }
    worstWeek[p] = { amount: Infinity, tournament: '—' }
  })
  for (const h of history) {
    PLAYERS.forEach(p => {
      const v = h.money?.[p] ?? 0
      if (v > bestWeek[p].amount) bestWeek[p] = { amount: v, tournament: h.tournament_name }
      if (v < worstWeek[p].amount) worstWeek[p] = { amount: v, tournament: h.tournament_name }
    })
  }

  // Pick grades: grade each golfer based on finish vs draft position
  const gradeMap: Record<string, { A: number; B: number; C: number; D: number; F: number }> = {}
  PLAYERS.forEach(p => gradeMap[p] = { A: 0, B: 0, C: 0, D: 0, F: 0 })

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
                {PLAYERS.map(p => <th key={p}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...history].sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((h, i) => (
                <tr key={i} className="row">
                  <td>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{h.tournament_name}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)' }}>{h.date}</div>
                  </td>
                  {PLAYERS.map(p => {
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
                {PLAYERS.map(p => {
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
  const [bootstrapped, setBootstrapped] = useState(false)
  const [tabKey, setTabKey] = useState(0)

  const isAdmin = ['Eric', 'Chase'].includes(currentPlayer ?? '')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Tab change with animation reset
  const handleTabChange = useCallback((t: string) => {
    setTab(t)
    setTabKey(k => k + 1)
    setSidebarOpen(false)
  }, [])

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
      .select('*, tournaments(name, date, is_major)')
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
        if (r.has_winner) grouped[tid].winner_player = r.player_name
      }
      setHistory(Object.values(grouped))
    }

    // Load golfer-level history
    const { data: gr } = await supabase
      .from('golfer_results')
      .select('*, tournaments(name, date, is_major)')
      .order('created_at', { ascending: false })
    if (gr) setGolferHistory(gr)
    setDataLoaded(true)
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

  const handleSetupTournament = async (data: { name: string; course: string; date: string; draft_order: string[]; is_major: boolean }) => {
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

  const handleDeleteResult = async (tournamentId: string, playerName: string, moneyWon: number) => {
    // Delete the result row
    await supabase.from('results').delete()
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)
    // Delete golfer results for this player in this tournament
    await supabase.from('golfer_results').delete()
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)
    // Reverse season money — recalculate from scratch
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
      {/* Hamburger button — mobile only, hide when sidebar open */}
      {!sidebarOpen && (
        <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
          <span /><span /><span />
        </button>
      )}
      <Sidebar
        currentPlayer={currentPlayer}
        tab={tab}
        setTab={handleTabChange}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        tournament={tournament}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main-content">
        {!dataLoaded ? (
          <SkeletonScreen />
        ) : (
          <div key={tabKey} className="tab-content">
            {tab === 'live'    && <LeaderboardTab tournament={tournament} standings={standings} liveData={liveData} pickMap={pickMap} loading={loading} lastUpdated={lastUpdated} onRefresh={fetchScores} money={weekMoney} flashMap={flashMap} />}
            {tab === 'picks'   && <PicksTab standings={standings} pickMap={pickMap} liveData={liveData} tournament={tournament} />}
            {tab === 'money'   && <MoneyTab seasonMoney={seasonMoney} weekMoney={weekMoney} tournament={tournament} history={history} />}
            {tab === 'draft'   && <DraftTab tournament={tournament} picks={picks} liveData={liveData} currentPlayer={currentPlayer} isAdmin={isAdmin} onPickMade={handlePickMade} />}
            {tab === 'history' && <HistoryTab history={history} golferHistory={golferHistory} isAdmin={isAdmin} onDeleteTournament={handleDeleteTournament} onEditResult={handleEditResult} onDeleteResult={handleDeleteResult} />}
            {tab === 'stats'   && <StatsTab history={history} />}
            {tab === 'recap'   && <SeasonRecapTab history={history} golferHistory={golferHistory} seasonMoney={seasonMoney} />}
            {tab === 'admin'   && isAdmin && <AdminTab tournament={tournament} standings={standings} weekMoney={weekMoney} onSetupTournament={handleSetupTournament} onFinalize={handleFinalize} onClearTournament={handleClearTournament} onClearPicks={handleClearPicks} />}
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
