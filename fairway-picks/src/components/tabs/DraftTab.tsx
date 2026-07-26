'use client'

import { useState, useEffect } from 'react'
import { toRelScore, buildPickMap, snakeDraftOrder } from '@/lib/scoring'
import type { Tournament, Pick, GolferScore } from '@/lib/types'

// ─── Draft Tab ────────────────────────────────────────────────────────────────
export function DraftTab({
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
