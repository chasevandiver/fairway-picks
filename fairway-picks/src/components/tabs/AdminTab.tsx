'use client'

import { useState, useEffect } from 'react'
import type { LeagueRules } from '@/lib/rules'
import type { Tournament, Pick, GolferScore, PlayerStanding } from '@/lib/types'
import { PGA_SCHEDULE } from '@/lib/constants'
import { isMajorName } from '@/lib/majors'
import { useConfirm } from '@/components/app/ConfirmDialog'
import type { LeagueMember } from '@/lib/roster'

// ─── Admin Tab ────────────────────────────────────────────────────────────────
export function AdminTab({
  tournament, standings, weekMoney, picks, liveData,
  leagueId, leagueName, inviteCode, leagueRules, roster,
  members, commissionerId, currentUserId, isPublicView,
  onSetupTournament, onFinalize, onClearTournament, onClearPicks, onSwapGolfer, onSaveRules, onSaveInviteCode,
  onRemoveMember, onRenameLeague, onTogglePublicView
}: {
  tournament: Tournament | null
  standings: PlayerStanding[]
  weekMoney: Record<string, number>
  picks: Pick[]
  liveData: GolferScore[]
  leagueId: string
  leagueName: string
  inviteCode: string
  leagueRules: LeagueRules
  roster: string[]
  members: LeagueMember[]
  commissionerId: string | null
  currentUserId: string
  isPublicView: boolean
  onSetupTournament: (data: { name: string; course: string; date: string; draft_order: string[]; is_major: boolean }) => Promise<void>
  onFinalize: () => Promise<void>
  onClearTournament: () => Promise<void>
  onClearPicks: () => Promise<void>
  onSwapGolfer: (pickId: string, newGolferName: string) => Promise<void>
  onSaveRules: (rules: Partial<LeagueRules>) => Promise<void>
  onSaveInviteCode: (code: string) => Promise<void>
  onRemoveMember: (userId: string) => Promise<void>
  onRenameLeague: (name: string) => Promise<void>
  onTogglePublicView: (next: boolean) => Promise<void>
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
  const { confirm, dialog } = useConfirm()
  // League name editor (same edit pattern as the invite code)
  const [nameInput, setNameInput] = useState(leagueName)
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [togglingView, setTogglingView] = useState(false)

  const handleSaveName = async () => {
    if (!nameInput.trim()) return
    setSavingName(true)
    await onRenameLeague(nameInput.trim())
    setEditingName(false)
    setSavingName(false)
  }

  const handleToggleView = async () => {
    if (togglingView) return
    setTogglingView(true)
    await onTogglePublicView(!isPublicView)
    setTogglingView(false)
  }

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

  // Auto-detect majors when tournament is selected. Shares one normalizer with
  // the Majors Wall so setup and display can't disagree on a spelling — they
  // used to, which is how a finalized "U.S. Open" landed in the wrong column.
  useEffect(() => {
    if (selectedTournament) {
      setIsMajor(isMajorName(selectedTournament.name))
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

  const handleFinalize = () => {
    confirm({
      title: 'Finalize & Record Results',
      message: `This records the results and money for the week${tournament ? ` (${tournament.name})` : ''} and closes the tournament. Standings and season money will be updated for everyone.`,
      confirmLabel: 'Finalize',
      onConfirm: async () => {
        setFinalizing(true)
        await onFinalize()
        setMsg('✅ Results recorded & season money updated!')
        setFinalizing(false)
        setTimeout(() => setMsg(''), 4000)
      },
    })
  }

  const handleClearPicks = () => {
    confirm({
      title: 'Clear All Picks',
      message: 'This deletes every pick for the active tournament so the draft can be redone. This cannot be undone.',
      confirmLabel: 'Clear Picks',
      danger: true,
      onConfirm: onClearPicks,
    })
  }

  const handleClearTournament = () => {
    confirm({
      title: 'Remove Tournament',
      message: `This deletes the active tournament${tournament ? ` (${tournament.name})` : ''} and all of its picks. This cannot be undone.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: onClearTournament,
    })
  }

  // Group schedule into upcoming vs past
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = PGA_SCHEDULE.filter((e) => e.date >= today)
  const past = PGA_SCHEDULE.filter((e) => e.date < today)

  return (
    <div>
      {dialog}
      <div className="page-header">
        <div className="page-title">Admin</div>
      </div>

      {msg && <div className="alert alert-green mb-24">{msg}</div>}

      {/* ── League Info ── */}
      <div className="card mb-24">
        <div className="card-header"><div className="card-title">League Info</div></div>
        <div className="card-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* League name — commissioner-editable, same pattern as the invite code */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 4 }}>League Name</div>
                {editingName ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={e => setNameInput(e.target.value)}
                      placeholder="League name"
                      style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
                        padding: '8px 12px', color: 'var(--text)', fontSize: 15, fontWeight: 600,
                        outline: 'none', width: 220,
                      }}
                    />
                    <button className="btn btn-green btn-sm" onClick={handleSaveName} disabled={savingName || !nameInput.trim()}>
                      {savingName ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => { setNameInput(leagueName); setEditingName(false) }}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{leagueName || '—'}</div>
                    <button className="btn btn-outline btn-sm" onClick={() => { setNameInput(leagueName); setEditingName(true) }} style={{ fontSize: 11 }}>
                      ✏️ Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="divider" />
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
            {/* Public guest view — toggle + shareable link (no sign-in required) */}
            <div>
              <div style={{ fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>
                Public View
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div
                  onClick={handleToggleView}
                  style={{
                    width: 20, height: 20, borderRadius: 4, border: `2px solid ${isPublicView ? 'var(--green)' : 'var(--border-bright)'}`,
                    background: isPublicView ? 'var(--green)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
                    opacity: togglingView ? 0.6 : 1,
                  }}
                >
                  {isPublicView && <span style={{ color: '#0a0c0f', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Public read-only view</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                    The /view/{inviteCode || 'CODE'} link works for anyone — no sign-in required.
                  </div>
                </div>
              </label>
              {isPublicView && (
                <div style={{ marginTop: 12 }}>
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
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Members ── */}
      <div className="card mb-24">
        <div className="card-header">
          <div className="card-title">Members</div>
          <span style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text-dim)' }}>
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </span>
        </div>
        <div className="card-body">
          {members.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              No members yet — share the invite code to get people in.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {members.map((m, i) => (
                <div
                  key={m.user_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                    borderBottom: i < members.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{m.display_name || '—'}</span>
                    {m.player_name && m.player_name !== m.display_name && (
                      <span style={{ color: 'var(--text-dim)', fontSize: 12, marginLeft: 6 }}>({m.player_name})</span>
                    )}
                  </div>
                  {m.user_id === commissionerId && (
                    <span className="badge badge-gold">Commissioner</span>
                  )}
                  {currentUserId === commissionerId && m.user_id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => confirm({
                        title: 'Remove Member',
                        message: `Remove ${m.display_name || 'this member'} from the league? They can rejoin with an invite code.`,
                        confirmLabel: 'Remove',
                        danger: true,
                        onConfirm: () => onRemoveMember(m.user_id),
                      })}
                      style={{
                        background: 'none', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4,
                        color: 'var(--red)', cursor: 'pointer', fontSize: 11, padding: '2px 6px',
                      }}
                      title="Remove from league"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          )}
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
                          aria-label={`Move ${p} up in draft order`}
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
                          aria-label={`Move ${p} down in draft order`}
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
                        aria-label={`Remove ${p} from draft`}
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
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isMajor}
                    aria-label="Major Championship"
                    onClick={() => setIsMajor(!isMajor)}
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: `2px solid ${isMajor ? 'var(--green)' : 'var(--border-bright)'}`,
                      background: isMajor ? 'var(--green)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s', padding: 0,
                    }}
                  >
                    {isMajor && <span style={{ color: '#0a0c0f', fontSize: 13, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                  </button>
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
                  <button className="btn btn-outline" onClick={handleClearPicks}>
                    🗑 Clear Picks (redo draft)
                  </button>
                  <button className="btn btn-danger" onClick={handleClearTournament}>
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
