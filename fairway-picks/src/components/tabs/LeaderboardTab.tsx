'use client'

import { toRelScore, scoreClass, getCurrentRound } from '@/lib/scoring'
import type { Tournament, GolferScore, PlayerStanding } from '@/lib/types'
import { ExpandablePlayerCard } from '@/components/app/PlayerCard'

// ─── Leaderboard Tab ──────────────────────────────────────────────────────────
export function LeaderboardTab({
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
