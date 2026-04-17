'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface LeaguePreview {
  id: string
  name: string
  invite_code: string
  rules: { picks_per_player: number; scoring: { weekly_winner: number } }
  memberCount: number
}

export default function JoinClient({ code, league }: { code: string; league: LeaguePreview | null }) {
  const router = useRouter()

  useEffect(() => {
    if (!league) return
    localStorage.setItem('activeLeagueId', league.id)
    router.push('/')
  }, [league, router])

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

  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Opening {league.name}…</h2>
      </div>
    </div>
  )
}
