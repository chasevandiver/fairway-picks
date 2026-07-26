'use client'

import { useState } from 'react'
import { toRelScore, scoreClass } from '@/lib/scoring'
import type { GolferScore, PlayerStanding } from '@/lib/types'

// ─── Golfer Position Badge ────────────────────────────────────────────────────
// Position-badge color ladder used by the guest view's player cards.
export function GolferBadge({ g }: { g: any }) {
  const isCut = g?.status === 'cut'
  const isWD = g?.status === 'wd'
  const pos = g?.position ?? '—'
  const posNum = parseInt(pos.replace(/^T/, ''))
  const isFirst = posNum === 1
  const isTop3 = !isNaN(posNum) && posNum >= 1 && posNum <= 3
  const label = isCut ? 'CUT' : isWD ? 'WD' : pos
  const color = isCut || isWD ? 'var(--red)' : isFirst ? 'var(--gold)' : isTop3 ? 'var(--green)' : 'var(--text)'
  const bg = isCut || isWD ? 'rgba(248,113,113,0.1)' : isFirst ? 'rgba(245,158,11,0.12)' : isTop3 ? 'rgba(74,222,128,0.10)' : 'var(--surface)'
  const borderColor = isCut || isWD ? 'rgba(248,113,113,0.25)' : isFirst ? 'rgba(245,158,11,0.3)' : isTop3 ? 'rgba(74,222,128,0.25)' : 'var(--border)'
  return (
    <div style={{
      fontFamily: 'DM Mono', fontSize: 11, fontWeight: 600, color,
      background: bg, border: `1px solid ${borderColor}`,
      borderRadius: 6, padding: '2px 6px', minWidth: 28, textAlign: 'center',
    }}>
      {label}
    </div>
  )
}

// ─── Scorecard Round Cell ─────────────────────────────────────────────────────
// One round's cell (with in-progress detection) in a player's expanded
// scorecard. Shared between ExpandablePlayerCard and the guest view PlayerCard.
export function RoundCell({ g, rounds, r, i, par }: {
  g: any
  rounds: (number | null)[]
  r: number | null
  i: number
  par: number
}) {
  const toPar = r !== null ? r - par : null
  const thruNum = parseInt(g.thru)
  const priorComplete = rounds.slice(0, i).every((x: number | null) => x !== null)
  const laterEmpty = rounds.slice(i + 1).every((x: number | null) => x === null)
  const isInProgress = r === null && priorComplete && laterEmpty &&
    !isNaN(thruNum) && thruNum > 0 && g.status === 'active'
  return (
    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'DM Mono', fontSize: 14, fontWeight: 500 }}>
        {r !== null ? r : (isInProgress ? '*' : '—')}
      </div>
      <div className={`score ${isInProgress ? scoreClass(g.today) : scoreClass(toPar)}`} style={{ fontSize: 9, marginTop: 1 }}>
        {isInProgress && g.today !== null
          ? `${toRelScore(g.today)} thru ${g.thru}`
          : (toPar !== null ? toRelScore(toPar) : '')}
      </div>
    </td>
  )
}

// ─── Expandable Player Card ───────────────────────────────────────────────────
export function ExpandablePlayerCard({
  standing, liveData, par, pickOrder
}: {
  standing: PlayerStanding
  liveData: GolferScore[]
  par: number
  pickOrder: string[]
}) {
  const [expanded, setExpanded] = useState(false)

  const golfers = pickOrder.map((name) => {
    const g = standing.golfers.find((x: any) => x.name.toLowerCase() === name.toLowerCase())
    const liveG = liveData.find(d => d.name.toLowerCase() === name.toLowerCase())
    if (liveG && g) return { ...g, ...liveG, adjScore: g.adjScore, displayRounds: g.displayRounds }
    return liveG || g || { name, score: null, today: null, thru: '—', position: '—', status: 'active' as const, rounds: [null,null,null,null], par }
  })

  const todayScores = golfers.map((g: any) => g?.today).filter((t: any) => t != null)
  const todayTotal = todayScores.length > 0 ? todayScores.reduce((sum: number, t: number) => sum + t, 0) : null

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 13, flexShrink: 0 }}>
            {standing.player[0]}
          </div>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{standing.player}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>Pos:</span>
              {golfers.map((g: any) => {
                const pos = g?.position ?? '—'
                const isCut = g?.status === 'cut'
                const isWD = g?.status === 'wd'
                const posNum = parseInt(pos.replace(/^T/, ''))
                const isFirst = posNum === 1
                const isTop3 = !isNaN(posNum) && posNum >= 1 && posNum <= 3
                const label = isCut ? 'CUT' : isWD ? 'WD' : pos
                const color = isCut || isWD ? 'var(--red)' : isFirst ? 'var(--gold)' : isTop3 ? 'var(--green)' : 'var(--text)'
                const bg = isCut || isWD ? 'rgba(248,113,113,0.1)' : isFirst ? 'rgba(245,158,11,0.12)' : isTop3 ? 'rgba(74,222,128,0.10)' : 'var(--surface)'
                const borderColor = isCut || isWD ? 'rgba(248,113,113,0.25)' : isFirst ? 'rgba(245,158,11,0.3)' : isTop3 ? 'rgba(74,222,128,0.25)' : 'var(--border)'
                return (
                  <div key={g?.name} style={{
                    fontFamily: 'DM Mono', fontSize: 11, fontWeight: 600, color,
                    background: bg, border: `1px solid ${borderColor}`,
                    borderRadius: 6, padding: '2px 6px', minWidth: 28, textAlign: 'center', lineHeight: 1.4,
                  }}>
                    {label}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {todayTotal !== null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Today</div>
              <div className={`score ${scoreClass(todayTotal)}`} style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 600 }}>
                {toRelScore(todayTotal)}
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Total</div>
            <div className={`score ${scoreClass(standing.totalScore)}`} style={{ fontSize: 18, fontFamily: 'DM Mono', fontWeight: 700 }}>
              {toRelScore(standing.totalScore)}
            </div>
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
                      {rounds.map((r: number | null, i: number) => (
                        <RoundCell key={i} g={g} rounds={rounds} r={r} i={i} par={par} />
                      ))}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div className={`score ${scoreClass(g.adjScore ?? g.score)}`} style={{ fontSize: 16, fontFamily: 'DM Mono', fontWeight: 700 }}>
                          {toRelScore(g.adjScore ?? g.score)}
                        </div>
                        {g.thru && g.thru !== '—' && g.thru !== 'F' && g.thru !== 'CUT' && g.thru !== 'WD' && (
                          <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'DM Mono', marginTop: 1 }}>
                            thru {g.thru}
                          </div>
                        )}
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

export function ScorecardRow({ g, par }: { g: any; par: number }) {
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
        const roundPar = r !== null ? r - par : null
        // Detect in-progress round: this slot is null, all prior slots are filled,
        // and golfer has a live hole count (thru is a number, not F/—/CUT/WD)
        const thruNum = parseInt(g.thru)
        const priorComplete = rounds.slice(0, i).every((x: number | null) => x !== null)
        const laterEmpty = rounds.slice(i + 1).every((x: number | null) => x === null)
        const isInProgress = r === null && priorComplete && laterEmpty &&
          !isNaN(thruNum) && thruNum > 0 &&
          g.status === 'active'
        return (
          <td key={i} style={{ padding: '11px 10px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 15, fontWeight: 500 }}>
              {r !== null ? r : (isInProgress ? '*' : '—')}
            </div>
            <div className={`score ${isInProgress ? scoreClass(g.today) : scoreClass(roundPar)}`} style={{ fontSize: 10, marginTop: 1 }}>
              {isInProgress && g.today !== null
                ? `${toRelScore(g.today)} thru ${g.thru}`
                : (roundPar !== null ? toRelScore(roundPar) : '')}
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
