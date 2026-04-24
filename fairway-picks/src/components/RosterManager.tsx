'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

export interface RosterEntry {
  id: string
  player_name: string
  user_id: string | null
}

export default function RosterManager({
  leagueId,
  roster,
  onChanged,
}: {
  leagueId: string
  roster: RosterEntry[]
  onChanged: () => void
}) {
  const supabase = createClient()
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...roster].sort((a, b) => a.player_name.localeCompare(b.player_name)),
    [roster]
  )

  async function withAccessToken<T>(fn: (token: string) => Promise<T>): Promise<T | null> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setMsg({ kind: 'err', text: 'Session expired — please sign in again.' })
      return null
    }
    return fn(session.access_token)
  }

  async function handleAdd() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setAdding(true)
    setMsg(null)
    try {
      await withAccessToken(async (token) => {
        const res = await fetch('/api/roster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ league_id: leagueId, player_name: trimmed }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setMsg({ kind: 'err', text: data.message || data.error || 'Could not add name.' })
          return
        }
        setNewName('')
        setMsg({ kind: 'ok', text: `✓ Added "${data.entry.player_name}"` })
        onChanged()
      })
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(entry: RosterEntry) {
    const label = entry.player_name
    if (!confirm(`Remove "${label}" from this league's roster?\nThis only works if they have no picks or results on record.`)) return
    setRemovingId(entry.id)
    setMsg(null)
    try {
      await withAccessToken(async (token) => {
        const res = await fetch('/api/roster', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: entry.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setMsg({ kind: 'err', text: data.message || data.error || 'Could not remove.' })
          return
        }
        setMsg({ kind: 'ok', text: `✓ Removed "${label}"` })
        onChanged()
      })
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header">
        <div className="card-title">Manage Roster</div>
        <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>
          {sorted.length} {sorted.length === 1 ? 'player' : 'players'}
        </span>
      </div>

      <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
        These names drive the draft, standings, stats, and money. When someone joins with their sign-in,
        we add their display name automatically. Add placeholder names here for friends who won't be signing up.
      </p>

      {/* Add form */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          placeholder="Add a placeholder name…"
          maxLength={40}
          disabled={adding}
          style={{
            flex: 1,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 14px',
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={adding || !newName.trim()}
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
      </div>

      {msg && (
        <p style={{
          color: msg.kind === 'ok' ? 'var(--green)' : 'var(--red)',
          fontSize: 13,
          marginBottom: 12,
        }}>
          {msg.text}
        </p>
      )}

      {/* Current roster */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sorted.map((entry) => {
          const isPlaceholder = entry.user_id === null
          return (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  className="user-avatar"
                  style={{
                    width: 28,
                    height: 28,
                    fontSize: 12,
                    background: isPlaceholder ? 'var(--surface)' : undefined,
                    color: isPlaceholder ? 'var(--text-dim)' : undefined,
                  }}
                >
                  {entry.player_name[0]?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{entry.player_name}</div>
                  <div style={{
                    fontFamily: 'DM Mono',
                    fontSize: 10,
                    color: isPlaceholder ? 'var(--text-dim)' : 'var(--green)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}>
                    {isPlaceholder ? 'Placeholder · not linked' : 'Linked to member'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleRemove(entry)}
                disabled={removingId === entry.id}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  color: 'var(--text-dim)',
                  fontSize: 12,
                  fontFamily: 'DM Mono',
                  cursor: removingId === entry.id ? 'default' : 'pointer',
                  opacity: removingId === entry.id ? 0.5 : 1,
                }}
              >
                {removingId === entry.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
            No roster entries yet.
          </p>
        )}
      </div>
    </div>
  )
}
