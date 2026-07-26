'use client'

import { useMemo, useState } from 'react'
import { toRelScore, scoreClass, getCurrentRound, formatMoney, moneyClass } from '@/lib/scoring'
import type { Tournament, GolferScore, PlayerStanding } from '@/lib/types'
import { ExpandablePlayerCard } from '@/components/app/PlayerCard'

type SortKey = 'pos' | 'golfer' | 'total' | 'today'

// Numeric position for sorting: strips the "T" tie prefix; CUT/WD and
// non-numeric positions sort last.
function posValue(g: GolferScore): number {
  if (g.status === 'cut' || g.status === 'wd') return Infinity
  const n = parseInt((g.position || '').replace(/^T/, ''), 10)
  return isNaN(n) ? Infinity : n
}

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────
export function LeaderboardTab({
  tournament, standings, liveData, pickMap, loading, lastUpdated, onRefresh, money, flashMap, roster, isLiveData, currentPlayer
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
  isLiveData: boolean
  currentPlayer: string | null
}) {
  const safeData = Array.isArray(liveData) ? liveData : []
  const par = safeData[0]?.par ?? 72

  // Tour Leaderboard sorting — default (sortKey null) keeps the feed's
  // position order.
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return safeData
    const dir = sortDir === 'asc' ? 1 : -1
    // Nulls always sort last, regardless of direction.
    const cmpNullable = (a: number | null, b: number | null) => {
      if (a === null && b === null) return 0
      if (a === null) return 1
      if (b === null) return -1
      return (a - b) * dir
    }
    return [...safeData].sort((a, b) => {
      switch (sortKey) {
        case 'pos': {
          const pa = posValue(a)
          const pb = posValue(b)
          if (pa === Infinity && pb === Infinity) return 0
          if (pa === Infinity) return 1
          if (pb === Infinity) return -1
          return (pa - pb) * dir
        }
        case 'golfer': return a.name.localeCompare(b.name) * dir
        case 'total':  return cmpNullable(a.score, b.score)
        case 'today':  return cmpNullable(a.today, b.today)
      }
    })
  }, [safeData, sortKey, sortDir])

  const sortableTh = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        color: sortKey === key ? 'var(--green)' : undefined,
      }}
      title={`Sort by ${label}`}
    >
      {label}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

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
              {Date.now() - lastUpdated.getTime() > 10 * 60 * 1000 && (
                <span style={{ color: 'var(--gold)', marginLeft: 4 }}>(stale)</span>
              )}
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

      {!isLiveData && (
        <div className="alert alert-gold mb-24">
          ⚠️ Live scores are temporarily unavailable — showing placeholder data. Standings will update when the feed returns.
        </div>
      )}

      {/* ── My Picks Today strip ── */}
      {currentPlayer && (pickMap[currentPlayer]?.length ?? 0) > 0 && (() => {
        const mine = standings.find(s => s.player === currentPlayer)
        if (!mine || mine.golfers.length === 0) return null
        // Last name only when the full name would crowd the chip.
        const shortName = (name: string) =>
          name.length > 14 ? name.split(' ').slice(-1)[0] : name
        return (
          <div className="card mb-24">
            <div className="card-header">
              <div className="card-title">My Picks Today</div>
              <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>{currentPlayer}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 16px' }}>
              {mine.golfers.map(g => (
                <div key={g.name} style={{
                  flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px',
                }}>
                  <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>{shortName(g.name)}</span>
                  {g.status === 'cut'
                    ? <span className="badge badge-red">CUT</span>
                    : g.status === 'wd'
                      ? <span className="badge badge-gray">WD</span>
                      : <span className="badge badge-green">{g.position || '—'}</span>}
                  <span className={`score ${scoreClass(g.score)}`} style={{ fontSize: 13 }}>{toRelScore(g.score)}</span>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {toRelScore(g.today)} · {g.thru}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Projected payouts (live, not final) ── */}
      {roster.length > 0 && standings.length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <div className="card-title">Projected Payouts</div>
            <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--gold)' }}>As it stands — live projection, not final</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 16px' }}>
            {[...roster].sort((a, b) => (money[b] ?? 0) - (money[a] ?? 0)).map(p => (
              <div key={p} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 12px',
              }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p}</span>
                <span className={moneyClass(money[p] ?? 0)} style={{ fontFamily: 'DM Mono', fontSize: 13, fontWeight: 700 }}>
                  {formatMoney(money[p] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ── On the move — biggest movers among picked golfers today ── */}
      {(() => {
        const pickedNames = new Set(
          Object.values(pickMap).flat().map(n => n.toLowerCase())
        )
        const movers = safeData.filter(
          g => g.today !== null && pickedNames.has(g.name.toLowerCase())
        )
        if (movers.length < 2) return null
        const hot = movers.reduce((best, g) => (g.today! < best.today! ? g : best), movers[0])
        const sliding = movers.reduce((worst, g) => (g.today! > worst.today! ? g : worst), movers[0])
        return (
          <div className="flex gap-12 mb-24" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'DM Mono', fontSize: 12 }}>
              🔥 Hot: <span style={{ fontWeight: 700, color: 'var(--green)' }}>{hot.name}</span>{' '}
              <span className={`score ${scoreClass(hot.today)}`} style={{ fontSize: 12 }}>({toRelScore(hot.today)})</span>
            </span>
            <span style={{ fontFamily: 'DM Mono', fontSize: 12 }}>
              🧊 Sliding: <span style={{ fontWeight: 700, color: 'var(--red)' }}>{sliding.name}</span>{' '}
              <span className={`score ${scoreClass(sliding.today)}`} style={{ fontSize: 12 }}>({toRelScore(sliding.today)})</span>
            </span>
          </div>
        )
      })()}

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
                {sortableTh('pos', 'Pos')}
                {sortableTh('golfer', 'Golfer')}
                {sortableTh('total', 'Total')}
                {sortableTh('today', 'Today')}
                <th>Thru</th>
                <th>Picked By</th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map((g, i) => {
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
