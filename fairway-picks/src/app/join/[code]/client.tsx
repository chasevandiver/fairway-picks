'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface LeaguePreview {
  id: string
  name: string
  invite_code: string
  rules: { picks_per_player: number; scoring: { weekly_winner: number } }
  memberCount: number
}

type Status = 'loading' | 'joining' | 'done' | 'signin-required' | 'error'

export default function JoinClient({ code, league }: { code: string; league: LeaguePreview | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!league) return
    let cancelled = false

    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      if (!session?.user) {
        // Not signed in — set the pending invite and let /auth bounce back
        // here after OTP verification.
        sessionStorage.setItem('pending_invite', code)
        setStatus('signin-required')
        return
      }

      setStatus('joining')
      try {
        const res = await fetch('/api/join-league', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ invite_code: code }),
        })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          if (!cancelled) {
            setErrorMsg(data.message || data.error || 'Unable to join this league.')
            setStatus('error')
          }
          return
        }

        if (!cancelled) {
          localStorage.setItem('activeLeagueId', league.id)
          setStatus('done')
          router.push('/')
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Network error — please try again.')
          setStatus('error')
        }
      }
    })()

    return () => { cancelled = true }
  }, [code, league, router, supabase])

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

  if (status === 'signin-required') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Join {league.name}</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
            You're being invited to join this league.
            <br />Sign in to claim your roster spot.
          </p>
          <a href="/auth" className="btn btn-primary" style={{ width: '100%' }}>
            Sign in to join
          </a>
          <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 12 }}>
            {league.memberCount} {league.memberCount === 1 ? 'member' : 'members'} already in this league
          </p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Couldn't join</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
            {errorMsg}
          </p>
          <a href="/" className="btn btn-outline">Go Home</a>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>
          {status === 'joining' ? `Joining ${league.name}…` : `Opening ${league.name}…`}
        </h2>
      </div>
    </div>
  )
}
