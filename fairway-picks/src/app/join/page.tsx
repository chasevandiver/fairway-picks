'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinLanding() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length < 4) return

    setStatus('loading')
    try {
      const res = await fetch(`/api/league-data?invite_code=${trimmed}`)
      const data = await res.json()
      if (!res.ok || data.error || !data.leagueId) {
        setStatus('error')
        setErrorMsg(`"${trimmed}" doesn't match any league. Check with your commissioner.`)
        return
      }
      localStorage.setItem('activeLeagueId', data.leagueId)
      router.push('/')
    } catch {
      setStatus('error')
      setErrorMsg('Something went wrong. Please try again.')
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <h1>Fore <span>Picks</span></h1>
          <p>PGA TOUR PICK'EM LEAGUE</p>
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>
          Enter the invite code from your league commissioner.
        </p>
        {status === 'error' && (
          <p style={{ color: 'var(--red)', textAlign: 'center', fontSize: 13, marginBottom: 12 }}>
            {errorMsg}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); if (status === 'error') setStatus('idle') }}
              placeholder="EAGLE7"
              maxLength={8}
              style={{
                width: '100%',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '14px',
                color: 'var(--green)',
                fontSize: 28,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                textAlign: 'center',
                letterSpacing: '0.2em',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              autoFocus
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={code.trim().length < 4 || status === 'loading'}
          >
            {status === 'loading' ? 'Finding league…' : 'View My League'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: 20 }}>
          <a href="/auth" style={{ color: 'var(--text-dim)', fontSize: 12, textDecoration: 'none' }}>
            Don't have a code? Create your own league →
          </a>
        </p>
      </div>
    </div>
  )
}
