'use client'

import { useState } from 'react'
import { toRelScore, scoreClass, formatMoney } from '@/lib/scoring'
import type { LeagueRules } from '@/lib/rules'
import { useConfirm } from '@/components/app/ConfirmDialog'

// ─── History Tab ──────────────────────────────────────────────────────────────
export function HistoryTab({ history, golferHistory, isAdmin, roster, rules, onDeleteTournament, onEditResult, onDeleteResult }: {
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
  const { confirm, dialog } = useConfirm()

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

  const handleDelete = (h: any) => {
    confirm({
      title: 'Delete Tournament',
      message: `Delete "${h.tournament_name}" from history? This will also reverse season money. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: async () => {
        setDeleting(h.tournament_id)
        await onDeleteTournament(h.tournament_id, h.money || {})
        setDeleting(null)
      },
    })
  }

  return (
    <div>
      {dialog}
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
                            onClick={() => confirm({
                              title: 'Remove Result',
                              message: `Remove ${s.player} from this tournament? Their money will be reversed. This cannot be undone.`,
                              confirmLabel: 'Remove',
                              danger: true,
                              onConfirm: () => onDeleteResult(h.tournament_id, s.player, moneyVal),
                            })}
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
