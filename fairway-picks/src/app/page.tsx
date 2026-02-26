‘use client’

import { useState, useEffect, useCallback, useRef } from ‘react’
import { createClient } from ‘@/lib/supabase’
import {
toRelScore, scoreClass, formatMoney, moneyClass,
buildPickMap, computeStandings, computeMoney, snakeDraftOrder
} from ‘@/lib/scoring’
import { PLAYERS, PAYOUT_RULES } from ‘@/lib/types’
import type { Tournament, Pick, GolferScore, PlayerStanding, SeasonMoney } from ‘@/lib/types’

const PICKS_PER_PLAYER = 4
const REFRESH_INTERVAL = 120_000 // 2 minutes

// ─── 2026 PGA Tour Schedule ───────────────────────────────────────────────────
const PGA_SCHEDULE = [
{ name: ‘The Sentry’,                        course: ‘Plantation Course at Kapalua’,       date: ‘2026-01-08’ },
{ name: ‘Sony Open in Hawaii’,                course: ‘Waialae Country Club’,               date: ‘2026-01-15’ },
{ name: ‘The American Express’,               course: ‘PGA West / La Quinta CC’,            date: ‘2026-01-22’ },
{ name: ‘Farmers Insurance Open’,             course: ‘Torrey Pines Golf Course’,           date: ‘2026-01-29’ },
{ name: ‘AT&T Pebble Beach Pro-Am’,           course: ‘Pebble Beach Golf Links’,            date: ‘2026-02-05’ },
{ name: ‘WM Phoenix Open’,                    course: ‘TPC Scottsdale’,                     date: ‘2026-02-12’ },
{ name: ‘Genesis Invitational’,               course: ‘Riviera Country Club’,               date: ‘2026-02-19’ },
{ name: ‘Puerto Rico Open’,                   course: ‘Grand Reserve Country Club’,         date: ‘2026-02-26’ },
{ name: ‘Mexico Open at Vidanta’,             course: ‘Vidanta Vallarta’,                   date: ‘2026-02-26’ },
{ name: ‘Cognizant Classic in The Palm Beaches’, course: ‘PGA National Resort’,             date: ‘2026-02-26’ },
{ name: ‘Arnold Palmer Invitational’,         course: ‘Bay Hill Club & Lodge’,              date: ‘2026-03-05’ },
{ name: ‘THE PLAYERS Championship’,           course: ‘TPC Sawgrass’,                       date: ‘2026-03-12’ },
{ name: ‘Valspar Championship’,               course: ‘Innisbrook Resort (Copperhead)’,      date: ‘2026-03-19’ },
{ name: ‘Texas Children's Houston Open’,     course: ‘Memorial Park Golf Course’,          date: ‘2026-03-26’ },
{ name: ‘Valero Texas Open’,                  course: ‘TPC San Antonio (Oaks)’,             date: ‘2026-04-02’ },
{ name: ‘Masters Tournament’,                 course: ‘Augusta National Golf Club’,         date: ‘2026-04-09’ },
{ name: ‘RBC Heritage’,                       course: ‘Harbour Town Golf Links’,            date: ‘2026-04-16’ },
{ name: ‘Zurich Classic of New Orleans’,      course: ‘TPC Louisiana’,                      date: ‘2026-04-23’ },
{ name: ‘Myrtle Beach Classic’,               course: ‘Dunes Golf and Beach Club’,          date: ‘2026-04-30’ },
{ name: ‘Wells Fargo Championship’,           course: ‘Quail Hollow Club’,                  date: ‘2026-05-07’ },
{ name: ‘AT&T Byron Nelson’,                  course: ‘TPC Craig Ranch’,                    date: ‘2026-05-14’ },
{ name: ‘PGA Championship’,                   course: ‘Aronimink Golf Club’,                date: ‘2026-05-21’ },
{ name: ‘Charles Schwab Challenge’,           course: ‘Colonial Country Club’,              date: ‘2026-05-28’ },
{ name: ‘the Memorial Tournament’,            course: ‘Muirfield Village Golf Club’,        date: ‘2026-06-04’ },
{ name: ‘RBC Canadian Open’,                  course: ‘Hamilton Golf & Country Club’,       date: ‘2026-06-11’ },
{ name: ‘U.S. Open’,                          course: ‘Oakmont Country Club’,               date: ‘2026-06-18’ },
{ name: ‘Travelers Championship’,             course: ‘TPC River Highlands’,                date: ‘2026-06-25’ },
{ name: ‘Rocket Mortgage Classic’,            course: ‘Detroit Golf Club’,                  date: ‘2026-07-02’ },
{ name: ‘John Deere Classic’,                 course: ‘TPC Deere Run’,                      date: ‘2026-07-09’ },
{ name: ‘The Open Championship’,              course: ‘Royal Portrush Golf Club’,           date: ‘2026-07-16’ },
{ name: ‘Barracuda Championship’,             course: ‘Tahoe Mountain Club’,                date: ‘2026-07-16’ },
{ name: ‘Genesis Scottish Open’,              course: ‘The Renaissance Club’,               date: ‘2026-07-09’ },
{ name: ‘3M Open’,                            course: ‘TPC Twin Cities’,                    date: ‘2026-07-23’ },
{ name: ‘Olympic Men's Golf’,                course: ‘Real Club de Golf de Sevilla’,       date: ‘2026-07-30’ },
{ name: ‘Wyndham Championship’,               course: ‘Sedgefield Country Club’,            date: ‘2026-08-06’ },
{ name: ‘FedEx St. Jude Championship’,        course: ‘TPC Southwind’,                      date: ‘2026-08-13’ },
{ name: ‘BMW Championship’,                   course: ‘Aronimink Golf Club’,                date: ‘2026-08-20’ },
{ name: ‘TOUR Championship’,                  course: ‘East Lake Golf Club’,                date: ‘2026-08-27’ },
]

// ─── Theme Context ────────────────────────────────────────────────────────────
function useTheme() {
const [theme, setTheme] = useState<‘dark’ | ‘light’>(‘dark’)

useEffect(() => {
const saved = localStorage.getItem(‘fairway_theme’) as ‘dark’ | ‘light’ | null
if (saved) setTheme(saved)
}, [])

const toggle = useCallback(() => {
setTheme((t) => {
const next = t === ‘dark’ ? ‘light’ : ‘dark’
localStorage.setItem(‘fairway_theme’, next)
return next
})
}, [])

useEffect(() => {
document.documentElement.setAttribute(‘data-theme’, theme)
}, [theme])

return { theme, toggle }
}

// ─── Auto-Refresh Countdown Hook ─────────────────────────────────────────────
function useCountdown(lastUpdated: Date | null, intervalMs: number) {
const [secondsLeft, setSecondsLeft] = useState(intervalMs / 1000)

useEffect(() => {
if (!lastUpdated) return
const tick = () => {
const elapsed = Date.now() - lastUpdated.getTime()
const remaining = Math.max(0, Math.ceil((intervalMs - elapsed) / 1000))
setSecondsLeft(remaining)
}
tick()
const id = setInterval(tick, 1000)
return () => clearInterval(id)
}, [lastUpdated, intervalMs])

return secondsLeft
}

// ─── Odds Hook ────────────────────────────────────────────────────────────────
interface OddsEntry {
name: string
odds: string
impliedProb: number
}

function useOdds() {
const [oddsMap, setOddsMap] = useState<Record<string, OddsEntry>>({})
const [oddsSource, setOddsSource] = useState<string>(‘none’)

useEffect(() => {
(async () => {
try {
const res = await fetch(’/api/odds’)
const data = await res.json()
if (data.entries?.length > 0) {
const map: Record<string, OddsEntry> = {}
for (const e of data.entries) {
map[e.name.toLowerCase()] = e
}
setOddsMap(map)
setOddsSource(data.source)
}
} catch {}
})()
}, [])

return { oddsMap, oddsSource }
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (name: string) => void }) {
return (
<div className="login-screen">
<div className="login-card">
<div className="login-logo">
<h1>Fairway <span>Picks</span></h1>
<p>PGA TOUR PICK’EM LEAGUE</p>
</div>
<div style={{ marginBottom: 20, color: ‘var(–text-dim)’, fontSize: 13, textAlign: ‘center’ }}>
Who are you?
</div>
<div className="player-btns">
{PLAYERS.map((name) => (
<button key={name} className=“player-btn” onClick={() => onLogin(name)}>
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
{ key: ‘live’,    icon: ‘⛳’, label: ‘Leaderboard’ },
{ key: ‘picks’,   icon: ‘🏌️’, label: ‘Picks’ },
{ key: ‘money’,   icon: ‘💰’, label: ‘Money’ },
{ key: ‘draft’,   icon: ‘📋’, label: ‘Draft’ },
{ key: ‘history’, icon: ‘📈’, label: ‘History’ },
{ key: ‘admin’,   icon: ‘⚙️’, label: ‘Admin’,   adminOnly: true },
]

function Sidebar({
currentPlayer, tab, setTab, isAdmin, onLogout, tournament, theme, onToggleTheme
}: {
currentPlayer: string
tab: string
setTab: (t: string) => void
isAdmin: boolean
onLogout: () => void
tournament: Tournament | null
theme: ‘dark’ | ‘light’
onToggleTheme: () => void
}) {
return (
<div className="sidebar">
<div className="sidebar-logo">
<h1>Fairway <span>Picks</span></h1>
<p>PGA Tour Pick’em</p>
</div>

```
  <nav className="sidebar-nav">
    <div className="nav-label">Navigation</div>
    {NAV_ITEMS.filter(i => !i.adminOnly || isAdmin).map(item => (
      <button
        key={item.key}
        className={`nav-item ${tab === item.key ? 'active' : ''}`}
        onClick={() => setTab(item.key)}
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
    <button
      className="theme-toggle"
      onClick={onToggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span style={{ fontSize: 16 }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
      <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
    <div className="user-chip" style={{ marginTop: 10 }}>
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
```

)
}

// ─── Mobile Bottom Nav ────────────────────────────────────────────────────────
function MobileBottomNav({
tab, setTab, isAdmin
}: {
tab: string
setTab: (t: string) => void
isAdmin: boolean
}) {
return (
<div className="mobile-bottom-nav">
<div className="mobile-nav-grid">
{NAV_ITEMS.filter(i => !i.adminOnly || isAdmin).map(item => (
<button
key={item.key}
className={`mobile-nav-item ${tab === item.key ? 'active' : ''}`}
onClick={() => setTab(item.key)}
>
<span className="nav-icon">{item.icon}</span>
<span>{item.label}</span>
</button>
))}
</div>
</div>
)
}

// ─── Countdown Ring ───────────────────────────────────────────────────────────
function CountdownRing({ secondsLeft, total }: { secondsLeft: number; total: number }) {
const pct = secondsLeft / total
const r = 10
const circ = 2 * Math.PI * r
const offset = circ * (1 - pct)
const mins = Math.floor(secondsLeft / 60)
const secs = secondsLeft % 60

return (
<div className=“countdown-ring” title={`Next refresh in ${mins}:${secs.toString().padStart(2, '0')}`}>
<svg width="32" height="32" viewBox="0 0 24 24">
<circle cx="12" cy="12" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
<circle
cx=“12” cy=“12” r={r} fill=“none”
stroke=“var(–green)” strokeWidth=“2”
strokeLinecap=“round”
strokeDasharray={circ}
strokeDashoffset={offset}
style={{ transform: ‘rotate(-90deg)’, transformOrigin: ‘center’, transition: ‘stroke-dashoffset 1s linear’ }}
/>
</svg>
<span className="countdown-text">{mins}:{secs.toString().padStart(2, ‘0’)}</span>
</div>
)
}

// ─── Expandable Player Card (for Leaderboard) ─────────────────────────────────
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
width: ‘100%’,
padding: ‘12px 16px’,
background: ‘var(–surface2)’,
border: ‘1px solid var(–border)’,
borderRadius: ‘var(–radius-sm)’,
color: ‘var(–text)’,
cursor: ‘pointer’,
display: ‘flex’,
alignItems: ‘center’,
justifyContent: ‘space-between’,
transition: ‘all 0.15s’,
fontFamily: ‘Sora, sans-serif’
}}
className=“expandable-player-btn”
>
<div style={{ display: ‘flex’, alignItems: ‘center’, gap: 12 }}>
<div className=“user-avatar” style={{ width: 32, height: 32, fontSize: 13 }}>
{standing.player[0]}
</div>
<div style={{ textAlign: ‘left’ }}>
<div style={{ fontWeight: 600, fontSize: 14 }}>{standing.player}</div>
<div style={{ fontSize: 11, color: ‘var(–text-dim)’, fontFamily: ‘DM Mono’ }}>
{golfers.length} golfers
</div>
</div>
</div>
<div style={{ display: ‘flex’, alignItems: ‘center’, gap: 12 }}>
<div className={`score ${scoreClass(standing.totalScore)}`} style={{ fontSize: 18, fontFamily: ‘DM Mono’, fontWeight: 700 }}>
{toRelScore(standing.totalScore)}
</div>
<span style={{ fontSize: 16, color: ‘var(–text-dim)’, transition: ‘transform 0.2s’, transform: expanded ? ‘rotate(180deg)’ : ‘rotate(0deg)’ }}>
▼
</span>
</div>
</button>

```
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
```

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
const secondsLeft = useCountdown(lastUpdated, REFRESH_INTERVAL)
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
<div className=“flex gap-12” style={{ alignItems: ‘center’ }}>
{lastUpdated && (
<CountdownRing secondsLeft={secondsLeft} total={REFRESH_INTERVAL / 1000} />
)}
<button className="refresh-btn" onClick={onRefresh} disabled={loading}>
<span className={loading ? ‘spin’ : ‘’}>↻</span>
{loading ? ‘Refreshing…’ : ‘Refresh’}
</button>
</div>
</div>

```
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
        {safeData[0]?.name?.split(' ').pop() || '—'}
      </div>
      <div className="stat-label">Tour Leader</div>
    </div>
  </div>

  {/* Expandable Player Cards */}
  {standings.length > 0 && (
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

  {safeData.length > 0 && (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Tour Leaderboard</div>
        <div className="flex gap-8" style={{ alignItems: 'center' }}>
          <div className="live-dot" />
          <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>ESPN · Live</span>
        </div>
      </div>
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
          {safeData.slice(0, 30).map((g, i) => {
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
  )}
</div>
```

)
}

// ─── Picks Tab ────────────────────────────────────────────────────────────────
const ROUND_LABELS = [‘R1’, ‘R2’, ‘R3’, ‘R4’]

function ScorecardRow({ g, par }: { g: any; par: number }) {
const rounds: (number | null)[] = g.displayRounds ?? g.rounds ?? [null, null, null, null]
const totalStrokes = rounds.reduce((sum: number, r: number | null) => sum + (r ?? 0), 0)
const played = rounds.filter((r: number | null) => r !== null).length

// Helper to get position badge class
const getPositionClass = (pos: string) => {
const numPos = parseInt(pos.replace(/^T/i, ‘’))
if (isNaN(numPos)) return ‘’
if (numPos <= 10) return ‘top10’
if (numPos <= 20) return ‘top20’
return ‘’
}

const posClass = getPositionClass(g.position)
const isWinner = g.position === ‘1’ || g.position === ‘T1’
const isTop3 = !isNaN(parseInt(g.position.replace(/^T/i, ‘’))) && parseInt(g.position.replace(/^T/i, ‘’)) <= 3

return (
<tr style={{ borderTop: ‘1px solid var(–border)’ }}>
<td style={{ padding: ‘11px 18px’, minWidth: 160 }}>
<div style={{ fontWeight: 500, fontSize: 13, display: ‘flex’, alignItems: ‘center’, flexWrap: ‘wrap’, gap: 6 }}>
{g.name}
{isWinner && <span className="golfer-inline-badge winner">🏆</span>}
{!isWinner && isTop3 && <span className="golfer-inline-badge top3">🔝</span>}
</div>
<div style={{ display: ‘flex’, gap: 6, marginTop: 4, alignItems: ‘center’, flexWrap: ‘wrap’ }}>
<span className={`position-badge ${posClass}`}>#{g.position}</span>
{g.thru !== ‘—’ && <span style={{ fontFamily: ‘DM Mono’, fontSize: 10, color: ‘var(–text-dim)’ }}>Thru {g.thru}</span>}
{g.status === ‘cut’ && <span className=“badge badge-red” style={{ fontSize: 9, padding: ‘1px 6px’ }}>CUT*</span>}
{g.status === ‘wd’  && <span className=“badge badge-gray” style={{ fontSize: 9, padding: ‘1px 6px’ }}>WD*</span>}
</div>
</td>
{rounds.map((r: number | null, i: number) => {
const roundPar = r !== null ? r - par : null
return (
<td key={i} style={{ padding: ‘11px 10px’, textAlign: ‘center’, borderLeft: ‘1px solid var(–border)’ }}>
<div style={{ fontFamily: ‘DM Mono’, fontSize: 15, fontWeight: 500 }}>
{r ?? ‘—’}
</div>
<div className={`score ${scoreClass(roundPar)}`} style={{ fontSize: 10, marginTop: 1 }}>
{roundPar !== null ? toRelScore(roundPar) : ‘’}
</div>
</td>
)
})}
<td style={{ padding: ‘11px 14px’, textAlign: ‘center’, borderLeft: ‘1px solid var(–border-bright)’ }}>
<div style={{ fontFamily: ‘DM Mono’, fontSize: 15, fontWeight: 600 }}>
{played > 0 ? totalStrokes : ‘—’}
</div>
<div className={`score ${scoreClass(g.score)}`} style={{ fontSize: 10, marginTop: 1 }}>
{g.score !== null ? toRelScore(g.score) : ‘’}
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
const safeData = Array.isArray(liveData) ? liveData : []

if (!tournament) return <div className="empty-state card"><div className="empty-icon">📋</div><p>No active tournament.</p></div>
if (Object.keys(pickMap).length === 0) return (
<div className="empty-state card"><div className="empty-icon">🏌️</div><p>Draft hasn’t happened yet.</p></div>
)

const par = safeData[0]?.par ?? 72

return (
<div>
<div className="page-header">
<div className="page-title">Picks · {tournament.name}</div>
<div style={{ fontSize: 12, color: ‘var(–text-dim)’, fontFamily: ‘DM Mono’ }}>Par {par} · *CUT/WD rounds are repeated</div>
</div>

```
  {PLAYERS.map((player) => {
    const playerPicks = pickMap[player] || []
    const s = standings.find((x) => x.player === player)
    if (playerPicks.length === 0) return null

    const golferRows = (s?.golfers ?? playerPicks.map((name) => {
      const g = safeData.find((d) => d.name.toLowerCase() === name.toLowerCase())
        ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active' as const, rounds: [null,null,null,null], par }
      const dr = [...(g.rounds ?? [null, null, null, null])]
      if (g.status === 'cut' || g.status === 'wd') { dr[2] = dr[0]; dr[3] = dr[1] }
      return { ...g, adjScore: g.score ?? 0, displayRounds: dr }
    })).map((g: any) => {
      if (g.status === 'cut' || g.status === 'wd') {
        const dr = [...(g.displayRounds ?? g.rounds ?? [null,null,null,null])]
        dr[2] = dr[0]; dr[3] = dr[1]
        return { ...g, displayRounds: dr }
      }
      return g
    })

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
      </div>
    )
  })}
</div>
```

)
}

// ─── Money Tab ────────────────────────────────────────────────────────────────
function MoneyTab({ seasonMoney, weekMoney, tournament, history }: {
seasonMoney: SeasonMoney[]
weekMoney: Record<string, number>
tournament: Tournament | null
history: any[]
}) {
const sorted = […seasonMoney].sort((a, b) => b.total - a.total)

return (
<div>
<div className="page-header">
<div className="page-title">Money</div>
</div>

```
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
```

)
}

// ─── Draft Tab ────────────────────────────────────────────────────────────────
function DraftTab({
tournament, picks, liveData, currentPlayer, isAdmin, onPickMade, onUndoPick, oddsMap, oddsSource
}: {
tournament: Tournament | null
picks: Pick[]
liveData: GolferScore[]
currentPlayer: string
isAdmin: boolean
onPickMade: (golferName: string, playerName: string) => Promise<void>
onUndoPick: () => Promise<void>
oddsMap: Record<string, OddsEntry>
oddsSource: string
}) {
const safeData = Array.isArray(liveData) ? liveData : []
const [search, setSearch] = useState(’’)
const [draftOrder, setDraftOrder] = useState<{ player: string; pick: number; round: number }[]>([])
const [saving, setSaving] = useState(false)
const [sortBy, setSortBy] = useState<‘odds’ | ‘position’>(‘odds’)
const [undoing, setUndoing] = useState(false)

const takenGolfers = picks.map((p) => p.golfer_name.toLowerCase())
const pickMap = buildPickMap(picks)
const totalPicks = PLAYERS.length * PICKS_PER_PLAYER
const pickIndex = picks.length
const isDraftComplete = picks.length >= totalPicks
const currentPickPlayer = draftOrder[pickIndex]?.player
const lastPick = picks.length > 0 ? picks[picks.length - 1] : null

useEffect(() => {
if (tournament?.draft_order?.length) {
setDraftOrder(snakeDraftOrder(tournament.draft_order, PICKS_PER_PLAYER))
}
}, [tournament])

const isMyTurn = currentPickPlayer === currentPlayer || isAdmin

const sortedGolfers = […safeData].filter(
(g) => !takenGolfers.includes(g.name.toLowerCase()) &&
g.name.toLowerCase().includes(search.toLowerCase())
).sort((a, b) => {
if (sortBy === ‘odds’) {
const oddsA = oddsMap[a.name.toLowerCase()]
const oddsB = oddsMap[b.name.toLowerCase()]
if (oddsA && oddsB) return oddsB.impliedProb - oddsA.impliedProb
if (oddsA && !oddsB) return -1
if (!oddsA && oddsB) return 1
const posA = parseInt(a.position.replace(/^T/i, ‘’)) || 999
const posB = parseInt(b.position.replace(/^T/i, ‘’)) || 999
return posA - posB
}
const posA = parseInt(a.position.replace(/^T/i, ‘’)) || 999
const posB = parseInt(b.position.replace(/^T/i, ‘’)) || 999
return posA - posB
})

const handlePick = async (name: string) => {
if (!currentPickPlayer) return
setSaving(true)
await onPickMade(name, currentPickPlayer)
setSearch(’’)
setSaving(false)
}

const handleUndo = async () => {
if (!lastPick) return
setUndoing(true)
await onUndoPick()
setUndoing(false)
}

if (!tournament) return (
<div className="empty-state card"><div className="empty-icon">📋</div><p>No active tournament. Admin needs to set one up.</p></div>
)

return (
<div>
<div className="page-header">
<div className="page-title">Snake Draft</div>
<div style={{ fontFamily: ‘DM Mono’, fontSize: 13, color: ‘var(–text-dim)’ }}>
{tournament.name}
</div>
</div>

```
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
            <div className="flex gap-8" style={{ alignItems: 'center' }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>
                Pick {pickIndex + 1} / {totalPicks}
              </span>
              {isAdmin && lastPick && !isDraftComplete && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleUndo}
                  disabled={undoing}
                  title={`Undo: ${lastPick.golfer_name} (${lastPick.player_name})`}
                >
                  {undoing ? '⏳' : '↩'} Undo
                </button>
              )}
            </div>
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

            {lastPick && (
              <div className="alert alert-green" style={{ marginBottom: 12, fontSize: 12 }}>
                ✅ Last pick: <strong>{lastPick.player_name}</strong> → {lastPick.golfer_name}
              </div>
            )}

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

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input
                    className="form-input"
                    placeholder="Search golfers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className={`btn btn-sm ${sortBy === 'odds' ? 'btn-green' : 'btn-outline'}`}
                    onClick={() => setSortBy(sortBy === 'odds' ? 'position' : 'odds')}
                    title="Toggle sort"
                  >
                    {sortBy === 'odds' ? '📊 Odds' : '🏌️ Position'}
                  </button>
                </div>

                {Object.keys(oddsMap).length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'DM Mono', marginBottom: 8 }}>
                    Sorted by betting odds (favorites first) · Source: {oddsSource === 'odds-api' ? 'Live Odds' : 'Field ranking'}
                  </div>
                )}

                <div className="golfer-list">
                  {safeData.length === 0 && (
                    <div style={{ padding: '16px', color: 'var(--text-dim)', fontSize: 13 }}>
                      Loading golfer list…
                    </div>
                  )}
                  {sortedGolfers.slice(0, 50).map((g) => {
                    const odds = oddsMap[g.name.toLowerCase()]
                    return (
                      <div
                        key={g.name}
                        className="golfer-option"
                        onClick={() => !saving && handlePick(g.name)}
                      >
                        <div>
                          <div style={{ fontWeight: 500 }}>{g.name}</div>
                          <div className="golfer-meta">
                            #{g.position} · {toRelScore(g.score)}
                            {odds && (
                              <span className="odds-badge">{odds.odds}</span>
                            )}
                          </div>
                        </div>
                        <span className="badge badge-green">Pick</span>
                      </div>
                    )
                  })}
                  {search && !sortedGolfers.find((g) => g.name.toLowerCase() === search.toLowerCase()) && (
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
                  {playerPicks.map((g) => {
                    const odds = oddsMap[g.toLowerCase()]
                    return (
                      <span key={g} className="badge badge-gray">
                        {g}
                        {odds && <span style={{ marginLeft: 4, color: 'var(--green)', fontSize: 10 }}>{odds.odds}</span>}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  </div>
</div>
```

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
const [selectedEvent, setSelectedEvent] = useState(’’)
const [draftOrderInput, setDraftOrderInput] = useState(PLAYERS.join(’, ‘))
const [saving, setSaving] = useState(false)
const [finalizing, setFinalizing] = useState(false)
const [msg, setMsg] = useState(’’)

const selectedTournament = PGA_SCHEDULE.find((e) => e.name === selectedEvent)

const handleSetup = async () => {
if (!selectedTournament) return
setSaving(true)
const orderArr = draftOrderInput.split(’,’).map((s) => s.trim()).filter(Boolean)
await onSetupTournament({ …selectedTournament, draft_order: orderArr })
setSelectedEvent(’’)
setMsg(‘✅ Tournament activated!’)
setSaving(false)
setTimeout(() => setMsg(’’), 3000)
}

const handleFinalize = async () => {
setFinalizing(true)
await onFinalize()
setMsg(‘✅ Results recorded & season money updated!’)
setFinalizing(false)
setTimeout(() => setMsg(’’), 4000)
}

const today = new Date().toISOString().slice(0, 10)
const upcoming = PGA_SCHEDULE.filter((e) => e.date >= today)
const past = PGA_SCHEDULE.filter((e) => e.date < today)

return (
<div>
<div className="page-header">
<div className="page-title">Admin</div>
</div>

```
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
```

)
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab({ history }: { history: any[] }) {
if (!history.length) return (
<div className="empty-state card">
<div className="empty-icon">📈</div>
<p>No past tournaments yet. Finalize one to record results.</p>
</div>
)

return (
<div>
<div className="page-header"><div className="page-title">History</div></div>
{history.map((h: any, i: number) => (
<div key={i} className="card">
<div className="card-header">
<div className="card-title">{h.tournament_name}</div>
<span style={{ fontFamily: ‘DM Mono’, fontSize: 12, color: ‘var(–text-dim)’ }}>{h.date}</span>
</div>
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
{(h.standings || []).map((s: any) => (
<tr key={s.player} className="row">
<td><span className={`rank rank-${s.rank}`}>#{s.rank}</span></td>
<td><strong>{s.player}</strong></td>
<td><span className={`score ${scoreClass(s.score)}`}>{toRelScore(s.score)}</span></td>
<td>
<span className={`score ${(h.money?.[s.player] || 0) > 0 ? 'under' : (h.money?.[s.player] || 0) < 0 ? 'over' : 'even'}`}>
{formatMoney(h.money?.[s.player] || 0)}
</span>
</td>
</tr>
))}
</tbody>
</table>
</div>
))}
</div>
)
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
const supabase = createClient()
const [currentPlayer, setCurrentPlayer] = useState<string | null>(null)
const [tab, setTab] = useState(‘live’)
const [tournament, setTournament] = useState<Tournament | null>(null)
const [picks, setPicks] = useState<Pick[]>([])
const [liveData, setLiveData] = useState<GolferScore[]>([])
const [seasonMoney, setSeasonMoney] = useState<SeasonMoney[]>([])
const [history, setHistory] = useState<any[]>([])
const [loading, setLoading] = useState(false)
const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
const [bootstrapped, setBootstrapped] = useState(false)

const { theme, toggle: toggleTheme } = useTheme()
const { oddsMap, oddsSource } = useOdds()

const isAdmin = [‘Eric’, ‘Chase’].includes(currentPlayer ?? ‘’)

useEffect(() => {
const saved = localStorage.getItem(‘fairway_player’)
if (saved) setCurrentPlayer(saved)
setBootstrapped(true)
}, [])

const loadData = useCallback(async () => {
const [{ data: t }, { data: p }, { data: sm }] = await Promise.all([
supabase.from(‘tournaments’).select(’*’).eq(‘status’, ‘active’).single(),
supabase.from(‘picks’).select(’*’).order(‘pick_order’),
supabase.from(‘season_money’).select(’*’),
])
if (t) setTournament(t)
if (p) setPicks(p)
if (sm) setSeasonMoney(sm)

```
const { data: results } = await supabase
  .from('results')
  .select('*, tournaments(name, date)')
  .order('created_at', { ascending: false })

if (results) {
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
```

}, [])

useEffect(() => {
if (currentPlayer) loadData()
}, [currentPlayer, loadData])

const fetchScores = useCallback(async () => {
if (!tournament) return
setLoading(true)
try {
const res = await fetch(’/api/scores’)
const data: GolferScore[] = await res.json()
setLiveData(Array.isArray(data) ? data : [])
setLastUpdated(new Date())
} catch {
setLiveData([])
}
setLoading(false)
}, [tournament])

useEffect(() => {
if (tournament) {
fetchScores()
const interval = setInterval(fetchScores, REFRESH_INTERVAL)
return () => clearInterval(interval)
}
}, [tournament, fetchScores])

useEffect(() => {
if (!currentPlayer) return
const channel = supabase
.channel(‘picks-changes’)
.on(‘postgres_changes’, { event: ‘*’, schema: ‘public’, table: ‘picks’ }, () => loadData())
.on(‘postgres_changes’, { event: ’*’, schema: ‘public’, table: ‘tournaments’ }, () => loadData())
.subscribe()
return () => { supabase.removeChannel(channel) }
}, [currentPlayer])

const pickMap = buildPickMap(picks)
const standings = computeStandings(liveData, pickMap)
const weekMoney = computeMoney(standings)

const handleLogin = (name: string) => {
setCurrentPlayer(name)
localStorage.setItem(‘fairway_player’, name)
}

const handleLogout = () => {
setCurrentPlayer(null)
localStorage.removeItem(‘fairway_player’)
setTab(‘live’)
}

const handleSetupTournament = async (data: { name: string; course: string; date: string; draft_order: string[] }) => {
await supabase.from(‘tournaments’).update({ status: ‘finalized’ }).eq(‘status’, ‘active’)
const { data: t } = await supabase.from(‘tournaments’).insert({ …data, status: ‘active’ }).select().single()
if (t) setTournament(t)
await loadData()
}

const handlePickMade = async (golferName: string, playerName: string) => {
if (!tournament) return
const playerPicks = picks.filter((p) => p.player_name === playerName)
const pickOrder = playerPicks.length + 1
await supabase.from(‘picks’).insert({
tournament_id: tournament.id,
player_name: playerName,
golfer_name: golferName,
pick_order: pickOrder,
})
await loadData()
}

const handleUndoPick = async () => {
if (!tournament || picks.length === 0) return
const lastPick = picks[picks.length - 1]
await supabase.from(‘picks’).delete().eq(‘id’, lastPick.id)
await loadData()
}

const handleFinalize = async () => {
if (!tournament || !standings.length) return
const money = weekMoney

```
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
```

}

const handleClearTournament = async () => {
if (!tournament) return
await supabase.from(‘tournaments’).delete().eq(‘id’, tournament.id)
setTournament(null)
setPicks([])
await loadData()
}

const handleClearPicks = async () => {
if (!tournament) return
await supabase.from(‘picks’).delete().eq(‘tournament_id’, tournament.id)
setPicks([])
}

if (!bootstrapped) return <div className="loading-screen"><div className=“spin” style={{ fontSize: 32 }}>⛳</div>Loading…</div>
if (!currentPlayer) return <LoginScreen onLogin={handleLogin} />

return (
<div className="app-shell">
<Sidebar
currentPlayer={currentPlayer}
tab={tab}
setTab={setTab}
isAdmin={isAdmin}
onLogout={handleLogout}
tournament={tournament}
theme={theme}
onToggleTheme={toggleTheme}
/>
<main className="main-content">
{tab === ‘live’    && <LeaderboardTab tournament={tournament} standings={standings} liveData={liveData} pickMap={pickMap} loading={loading} lastUpdated={lastUpdated} onRefresh={fetchScores} money={weekMoney} />}
{tab === ‘picks’   && <PicksTab standings={standings} pickMap={pickMap} liveData={liveData} tournament={tournament} />}
{tab === ‘money’   && <MoneyTab seasonMoney={seasonMoney} weekMoney={weekMoney} tournament={tournament} history={history} />}
{tab === ‘draft’   && <DraftTab tournament={tournament} picks={picks} liveData={liveData} currentPlayer={currentPlayer} isAdmin={isAdmin} onPickMade={handlePickMade} onUndoPick={handleUndoPick} oddsMap={oddsMap} oddsSource={oddsSource} />}
{tab === ‘history’ && <HistoryTab history={history} />}
{tab === ‘admin’   && isAdmin && <AdminTab tournament={tournament} standings={standings} weekMoney={weekMoney} onSetupTournament={handleSetupTournament} onFinalize={handleFinalize} onClearTournament={handleClearTournament} onClearPicks={handleClearPicks} />}
</main>
<MobileBottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} />
</div>
)
}