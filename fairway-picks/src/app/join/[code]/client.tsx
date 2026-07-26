'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface LeaguePreview {
  id: string
  name: string
  memberCount: number
}

export default function JoinClient({ code, league }: { code: string; league: LeaguePreview | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)

  useEffect(() => {
    if (!league) return
    let cancelled = false

    async function join() {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      if (!session) {
        // Remember the code, sign in, then come back here to finish the join.
        localStorage.setItem('pending_invite_code', code)
        setNeedsAuth(true)
        return
      }

      const { error: rpcError } = await supabase.rpc('join_league_by_code', { p_code: code })
      if (cancelled) return
      if (rpcError) {
        setError('Could not join the league. The invite code may have changed — check with your commissioner.')
        return
      }
      localStorage.setItem('activeLeagueId', league!.id)
      router.push('/')
    }

    join()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.id, code])

  if (!league) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Invalid Invite Code</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>
              The code <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>{code}</strong> doesn't match any league.
              <br />Check with your league commissioner.
            </p>
            <a href="/" className="btn btn-outline">Go Home</a>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Couldn't Join</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>{error}</p>
            <a href="/" className="btn btn-outline">Go Home</a>
          </div>
        </div>
      </div>
    )
  }

  if (needsAuth) {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            You're invited to {league.name}
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>
            {league.memberCount} {league.memberCount === 1 ? 'member' : 'members'} · Sign in with your email to join.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => router.push('/auth')}>
            Sign In to Join
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Joining {league.name}…</h2>
      </div>
    </div>
  )
}
