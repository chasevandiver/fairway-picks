'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { FOUNDING_LEAGUE_ID } from '@/lib/founding'
import { LEGACY_PLAYERS } from '@/lib/constants'

// ─── Setup Profile Screen ─────────────────────────────────────────────────────
// Shown to a newly authenticated user who doesn't have a profile yet.
// They either claim a legacy player name or enter a new display name.
export function SetupProfileScreen({
  supabase,
  userId,
  userEmail,
  onComplete,
}: {
  supabase: ReturnType<typeof createClient>
  userId: string
  userEmail: string
  onComplete: (displayName: string) => void
}) {
  const [displayName, setDisplayName] = useState(userEmail.split('@')[0])
  const [claimedName, setClaimedName] = useState<string | null>(null)
  const [unclaimedNames, setUnclaimedNames] = useState<string[]>([])
  const [isFoundingMember, setIsFoundingMember] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const FOUNDING_LEAGUE = FOUNDING_LEAGUE_ID
    Promise.all([
      supabase.from('player_aliases').select('player_name, user_id'),
      supabase.from('league_members')
        .select('league_id')
        .eq('league_id', FOUNDING_LEAGUE)
        .eq('user_id', userId)
        .maybeSingle(),
    ]).then(([{ data: aliasData }, { data: membership }]) => {
      setIsFoundingMember(!!membership)
      // Only hide names claimed by OTHER users — current user's alias stays selectable
      const claimedByOthers = (aliasData ?? [])
        .filter((a: any) => a.user_id !== userId)
        .map((a: any) => a.player_name)
      setUnclaimedNames(LEGACY_PLAYERS.filter((p) => !claimedByOthers.includes(p)))
      // Pre-select if this user already has an alias (handles missing-profile edge case)
      const mine = (aliasData ?? []).find((a: any) => a.user_id === userId)
      if (mine) setClaimedName(mine.player_name)
    })
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setLoading(true)
    setError(null)
    const name = claimedName ?? displayName.trim()
    if (!name) { setLoading(false); return }

    try {
      // is_admin is never written from the client — it's locked at the
      // database privilege level and granted only via migration backfill.
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: userId,
        display_name: name,
        email: userEmail,
      }, { onConflict: 'id' })
      if (profileErr) throw new Error(profileErr.message)

      if (claimedName) {
        // Only shown to existing founding-league members (isFoundingMember
        // gate above), so no membership insert is needed here.
        const { error: aliasErr } = await supabase.from('player_aliases').upsert(
          { user_id: userId, player_name: claimedName },
          { onConflict: 'user_id' }
        )
        if (aliasErr) throw new Error('That name has already been claimed.')
      }

      onComplete(name)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <h1>Fore <span>Picks</span></h1>
          <p>PGA TOUR PICK'EM LEAGUE</p>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
          Welcome! Let's set up your profile.
        </p>

        {isFoundingMember && unclaimedNames.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
              Are you one of these players?
            </div>
            <div className="player-btns">
              {unclaimedNames.map((name) => (
                <button
                  key={name}
                  className={`player-btn${claimedName === name ? ' active' : ''}`}
                  type="button"
                  onClick={() => {
                    setClaimedName(claimedName === name ? null : name)
                    setDisplayName(name)
                  }}
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
          </div>
        )}

        {!claimedName ? (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: 12, marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                maxLength={30}
                style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Setting up…' : 'Get Started'}
            </button>
          </form>
        ) : (
          <div>
            {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading} onClick={() => handleSubmit()}>
              {loading ? 'Setting up…' : `Continue as ${claimedName}`}
            </button>
            <button className="btn btn-outline" style={{ width: '100%', marginTop: 8 }} onClick={() => { setClaimedName(null); setDisplayName(userEmail.split('@')[0]) }}>
              Use a different name
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
