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
  { key: 'admin',   icon: '⚙️', label: 'Admin',   adminOnly: true },
]

function Sidebar({
  currentPlayer, tab, setTab, isAdmin, onLogout, tournament
}: {
  currentPlayer: string
  tab: string
  setTab: (t: string) => void
  isAdmin: boolean
  onLogout: () => void
  tournament: Tournament | null
}) {
  return (
    <div className="sidebar">
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
      )}
    </div>
  )
}

// ─── Picks Tab ────────────────────────────────────────────────────────────────
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

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Picks · {tournament.name}</div>
      </div>
      <div className="picks-grid">
        {PLAYERS.map((player) => {
          const playerPicks = pickMap[player] || []
          const s = standings.find((x) => x.player === player)
          return (
            <div key={player} className="player-card">
              <div className="player-card-header">
                <strong style={{ fontSize: 15 }}>{player}</strong>
                <span className={`score ${scoreClass(s?.totalScore)}`} style={{ fontSize: 18 }}>
                  {s ? toRelScore(s.totalScore) : '—'}
                </span>
              </div>
              {playerPicks.length === 0 ? (
                <div style={{ padding: '20px 18px', color: 'var(--text-dim)', fontSize: 13 }}>No picks yet</div>
              ) : playerPicks.map((name) => {
                const g = liveData.find((d) => d.name.toLowerCase() === name.toLowerCase())
                  ?? { name, score: null, today: null, thru: '—', position: '—', status: 'active' as const }
                return (
                  <div key={name} className="golfer-row">
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{g.name}</div>
                      <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>Thru {g.thru}</div>
                    </div>
                    <div className={`score ${scoreClass(g.today)}`} style={{ fontSize: 13 }}>{toRelScore(g.today)}</div>
                    <div className={`score ${scoreClass(g.score)}`} style={{ fontSize: 14 }}>{toRelScore(g.score)}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>#{g.position}</div>
                  </div>
                )
              })}
              {s && (s.hasWinner || s.hasTop3) && (
                <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
                  {s.hasWinner && <span className="badge badge-gold">🏆 Winner</span>}
                  {s.hasTop3   && <span className="badge badge-green">Top 3</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
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
  const [form, setForm] = useState({ name: '', course: '', date: '' })
  const [draftOrderInput, setDraftOrderInput] = useState(PLAYERS.join(', '))
  const [saving, setSaving] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSetup = async () => {
    if (!form.name) return
    setSaving(true)
    const orderArr = draftOrderInput.split(',').map((s) => s.trim()).filter(Boolean)
    await onSetupTournament({ ...form, draft_order: orderArr })
    setForm({ name: '', course: '', date: '' })
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

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Admin</div>
      </div>

      {msg && <div className="alert alert-green mb-24">{msg}</div>}

      <div className="grid-2">
        <div>
          <div className="card mb-24">
            <div className="card-header"><div className="card-title">New Tournament</div></div>
            <div className="card-body">
              <div className="form-group">
                <label className="form-label">Tournament Name</label>
                <input className="form-input" placeholder="e.g. The Players Championship"
                  value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Course</label>
                <input className="form-input" placeholder="e.g. TPC Sawgrass"
                  value={form.course} onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Date</label>
                <input className="form-input" type="date"
                  value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Draft Order (comma-separated)</label>
                <input className="form-input"
                  value={draftOrderInput} onChange={(e) => setDraftOrderInput(e.target.value)} />
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
                  Snake draft will reverse on even rounds. First player listed picks first.
                </div>
              </div>
              <button className="btn btn-green" onClick={handleSetup} disabled={saving || !form.name}>
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
            <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>{h.date}</span>
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
  const [tab, setTab] = useState('live')
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [liveData, setLiveData] = useState<GolferScore[]>([])
  const [seasonMoney, setSeasonMoney] = useState<SeasonMoney[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [bootstrapped, setBootstrapped] = useState(false)

  const isAdmin = currentPlayer === 'Eric' // Change to whoever should be admin

  // ── Load from localStorage on mount ──
  useEffect(() => {
    const saved = localStorage.getItem('fairway_player')
    if (saved) setCurrentPlayer(saved)
    setBootstrapped(true)
  }, [])

  // ── Fetch DB data when logged in ──
  const loadData = useCallback(async () => {
    const [{ data: t }, { data: p }, { data: sm }] = await Promise.all([
      supabase.from('tournaments').select('*').eq('status', 'active').single(),
      supabase.from('picks').select('*').order('pick_order'),
      supabase.from('season_money').select('*'),
    ])
    if (t) setTournament(t)
    if (p) setPicks(p)
    if (sm) setSeasonMoney(sm)

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
    // Deactivate old tournaments
    await supabase.from('tournaments').update({ status: 'finalized' }).eq('status', 'active')
    const { data: t } = await supabase.from('tournaments').insert({ ...data, status: 'active' }).select().single()
    if (t) setTournament(t)
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

  if (!bootstrapped) return <div className="loading-screen"><div className="spin" style={{ fontSize: 32 }}>⛳</div>Loading…</div>
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
      />
      <main className="main-content">
        {tab === 'live'    && <LeaderboardTab tournament={tournament} standings={standings} liveData={liveData} pickMap={pickMap} loading={loading} lastUpdated={lastUpdated} onRefresh={fetchScores} money={weekMoney} />}
        {tab === 'picks'   && <PicksTab standings={standings} pickMap={pickMap} liveData={liveData} tournament={tournament} />}
        {tab === 'money'   && <MoneyTab seasonMoney={seasonMoney} weekMoney={weekMoney} tournament={tournament} history={history} />}
        {tab === 'draft'   && <DraftTab tournament={tournament} picks={picks} liveData={liveData} currentPlayer={currentPlayer} isAdmin={isAdmin} onPickMade={handlePickMade} />}
        {tab === 'history' && <HistoryTab history={history} />}
        {tab === 'admin'   && isAdmin && <AdminTab tournament={tournament} standings={standings} weekMoney={weekMoney} onSetupTournament={handleSetupTournament} onFinalize={handleFinalize} onClearTournament={handleClearTournament} onClearPicks={handleClearPicks} />}
      </main>
    </div>
  )
}
