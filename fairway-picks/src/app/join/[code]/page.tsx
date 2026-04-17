'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface LeaguePreview {
  id: string
  name: string
  invite_code: string
  rules: { picks_per_player: number; scoring: { weekly_winner: number } }
  memberCount: number
}

export default function JoinPage({ params }: { params: { code: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const code = params.code.toUpperCase()

  const [league, setLeague] = useState<LeaguePreview | null>(null)
  const [status, setStatus] = useState<'loading' | 'preview' | 'already_member' | 'not_found' | 'joining' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function load() {
      // Auth check — race against timeout since getSession() can hang on
      // token refresh. The DB lookups go through a server-side API route
      // (service role) to avoid browser→Supabase REST call hangs.
      const authResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>(resolve =>
          setTimeout(() => resolve({ data: { session: null } }), 5000)
        ),
      ])
      const user = authResult.data.session?.user ?? null

      const url = user
        ? `/api/join-preview?invite_code=${encodeURIComponent(code)}&user_id=${user.id}`
        : `/api/join-preview?invite_code=${encodeURIComponent(code)}`
      const res = await fetch(url).then(r => r.json()).catch(() => null)

      if (!res || !res.league) { setStatus('not_found'); return }

      setLeague(res.league)
      if (res.alreadyMember) {
        setStatus('already_member')
      } else if (!user) {
        // Not logged in — redirect to auth, then back here
        sessionStorage.setItem('pending_invite', code)
        router.push('/auth')
      } else {
        setStatus('preview')
      }
    }
    load().catch(() => { setStatus('error'); setErrorMsg('Failed to load league. Please refresh.') })
  }, [code])

  async function handleJoin() {
    if (!league) return
    setStatus('joining')
    const authResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<{ data: { session: null } }>(resolve =>
        setTimeout(() => resolve({ data: { session: null } }), 5000)
      ),
    ])
    const user = authResult.data.session?.user ?? null
    if (!user) {
      sessionStorage.setItem('pending_invite', code)
      router.push('/auth')
      return
    }

    const { error } = await supabase.from('league_members').insert({
      league_id: league.id,
      user_id: user.id,
    })

    if (error) { setStatus('error'); setErrorMsg(error.message); return }

    // Persist the chosen league so the main app opens it (not the oldest/default).
    localStorage.setItem('activeLeagueId', league.id)
    router.push('/')
  }

  if (status === 'loading') {
    return (
      <div className="loading-screen">
        <div className="spin" style={{ fontSize: 32 }}>⛳</div>
        Loading invite…
      </div>
    )
  }

  if (status === 'not_found') {
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
            <button className="btn btn-outline" onClick={() => router.push('/')}>
              Go Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'already_member') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>You're already in this league!</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 8 }}>
              <strong style={{ color: 'var(--text)' }}>{league?.name}</strong>
            </p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>
              {league?.memberCount} member{league?.memberCount !== 1 ? 's' : ''}
            </p>
            <button className="btn btn-primary" onClick={() => { if (league) localStorage.setItem('activeLeagueId', league.id); router.push('/') }}>
              Go to My League
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <p style={{ color: 'var(--red)', marginBottom: 16 }}>{errorMsg}</p>
            <button className="btn btn-outline" onClick={() => setStatus('preview')}>Try Again</button>
          </div>
        </div>
      </div>
    )
  }

  // Preview state
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
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>{league?.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)' }}>Members</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{league?.memberCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)' }}>Picks per player</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{league?.rules?.picks_per_player ?? 4}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)' }}>Weekly winner</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--green)' }}>
                ${league?.rules?.scoring?.weekly_winner ?? 10}/player
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
          {status === 'joining' ? 'Joining…' : `Join ${league?.name}`}
        </button>
        <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => router.push('/')}>
          Cancel
        </button>
      </div>
    </div>
  )
}
