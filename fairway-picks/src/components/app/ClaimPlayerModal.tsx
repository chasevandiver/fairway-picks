'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { LEGACY_PLAYERS } from '@/lib/constants'

// ─── Claim Player Modal ───────────────────────────────────────────────────────
// Shown when a signed-in user with an existing profile hasn't yet claimed a
// legacy player name (e.g. they signed up before the alias system existed).
export function ClaimPlayerModal({
  supabase,
  userId,
  userEmail,
  onComplete,
  onClose,
}: {
  supabase: ReturnType<typeof createClient>
  userId: string
  userEmail: string
  onComplete: (displayName: string) => void
  onClose: () => void
}) {
  const [claimedName, setClaimedName] = useState<string | null>(null)
  const [unclaimedNames, setUnclaimedNames] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('player_aliases').select('player_name, user_id').then(({ data }) => {
      const claimedByOthers = (data ?? [])
        .filter((a: any) => a.user_id !== userId)
        .map((a: any) => a.player_name)
      setUnclaimedNames(LEGACY_PLAYERS.filter((p) => !claimedByOthers.includes(p)))
      const mine = (data ?? []).find((a: any) => a.user_id === userId)
      if (mine) setClaimedName(mine.player_name)
    })
  }, [])

  const handleClaim = async () => {
    if (!claimedName) return
    setLoading(true)
    setError(null)
    try {
      // email is required (NOT NULL) — omitting it made this upsert fail for
      // fresh rows. is_admin is never client-written.
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: userId,
        display_name: claimedName,
        email: userEmail,
      }, { onConflict: 'id' })
      if (profileErr) throw new Error(profileErr.message)

      const { error: aliasErr } = await supabase.from('player_aliases').upsert(
        { user_id: userId, player_name: claimedName },
        { onConflict: 'user_id' }
      )
      if (aliasErr) throw new Error('That name has already been claimed.')

      onComplete(claimedName)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div className="card" style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title">Claim Your Player Name</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
          Link your account to your player history.
        </p>
        {unclaimedNames.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
            All player names have already been claimed.
          </p>
        ) : (
          <>
            <div className="player-btns">
              {unclaimedNames.map((name) => (
                <button
                  key={name}
                  className={`player-btn${claimedName === name ? ' active' : ''}`}
                  type="button"
                  onClick={() => setClaimedName(claimedName === name ? null : name)}
                >
                  <div className="player-btn-avatar">{name[0]}</div>
                  {name}
                </button>
              ))}
            </div>
            {claimedName && (
              <p style={{ color: 'var(--green)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                You'll be linked to all of {claimedName}'s existing history.
              </p>
            )}
          </>
        )}
        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            disabled={!claimedName || loading}
            onClick={handleClaim}
          >
            {loading ? 'Claiming…' : claimedName ? `Claim ${claimedName}` : 'Select a name'}
          </button>
        </div>
      </div>
    </div>
  )
}
