'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface LeaguePreview {
  id: string
  name: string
  invite_code: string
  rules: { picks_per_player: number; scoring: { weekly_winner: number } }
  memberCount: number
}

export default function JoinClient({ code, league }: { code: string; league: LeaguePreview | null }) {
  const supabase = createClient()
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'joining' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

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

  async function handleJoin() {
    setStatus('joining')

    // Get existing session or create anonymous one — each step races a timeout
    const timed = <T,>(ms: number, fallback: T, p: Promise<T>) =>
      Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))])

    const sessionResult = await timed(5000, { data: { session: null } } as any, supabase.auth.getSession())
    let session = sessionResult.data.session

    if (!session) {
      const anonResult = await timed(8000, { data: { session: null }, error: new Error('timeout') } as any, supabase.auth.signInAnonymously())
      if (anonResult.error || !anonResult.data.session) {
        setStatus('error')
        setErrorMsg('Could not start session. Please refresh and try again.')
        return
      }
      session = anonResult.data.session
    }

    const { error } = await supabase.from('league_members').insert({
      league_id: league.id,
      user_id: session.user.id,
    })

    // Ignore duplicate-member errors — just go to the app
    if (error && !error.message.includes('duplicate')) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }

    localStorage.setItem('activeLeagueId', league.id)
    router.push('/')
  }

  if (status === 'error') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <p style={{ color: 'var(--red)', marginBottom: 16 }}>{errorMsg}</p>
            <button className="btn btn-outline" onClick={() => setStatus('idle')}>Try Again</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>You're invited!</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
            You've been invited to join a Fore Picks league.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{league.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)' }}>Members</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{league.memberCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)' }}>Picks per player</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{league.rules?.picks_per_player ?? 4}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)' }}>Weekly winner</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--green)' }}>
                ${league.rules?.scoring?.weekly_winner ?? 10}/player
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)' }}>Invite code</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)', letterSpacing: '0.1em' }}>{code}</span>
            </div>
          </div>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: 10 }}
          disabled={status === 'joining'}
          onClick={handleJoin}
        >
          {status === 'joining' ? 'Joining…' : `Join ${league.name}`}
        </button>
        <a href="/" className="btn btn-outline" style={{ width: '100%', display: 'block', textAlign: 'center' }}>
          Cancel
        </a>
      </div>
    </div>
  )
}
