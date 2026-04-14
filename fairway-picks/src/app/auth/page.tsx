'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function AuthPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPwaHelp, setShowPwaHelp] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <h1>Fore <span>Picks</span></h1>
          <p>PGA TOUR PICK'EM LEAGUE</p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--green)', marginBottom: 8, fontWeight: 600 }}>
              Check your email!
            </p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              We sent a magic link to{' '}
              <strong style={{ color: 'var(--text)' }}>{email}</strong>.
              <br />
              Click it to sign in. Check your spam if you don't see it.
            </p>
            <button
              className="btn btn-outline"
              style={{ marginTop: 20 }}
              onClick={() => setSent(false)}
            >
              Try a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  color: 'var(--text-dim)',
                  fontSize: 12,
                  marginBottom: 6,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={{
                  width: '100%',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 14px',
                  color: 'var(--text)',
                  fontSize: 15,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {error && (
              <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Send Magic Link'}
            </button>
          </form>
        )}

        <p
          style={{
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontSize: 12,
            marginTop: 20,
          }}
        >
          No password needed — we'll email you a link to sign in.
        </p>

        {/* iPhone Home Screen help */}
        <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button
            type="button"
            onClick={() => setShowPwaHelp(!showPwaHelp)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12,
              cursor: 'pointer', width: '100%', textAlign: 'center', fontFamily: 'var(--font-mono)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <span>{showPwaHelp ? '▲' : '▼'}</span>
            {isStandalone ? '📱 Signing in from Home Screen app?' : '📱 Using the Home Screen app?'}
          </button>
          {showPwaHelp && (
            <div style={{
              marginTop: 12, padding: '12px 14px', background: 'var(--surface2)',
              borderRadius: 8, border: '1px solid var(--border)', fontSize: 12,
              color: 'var(--text-dim)', lineHeight: 1.7,
            }}>
              {isStandalone ? (
                <>
                  <strong style={{ color: 'var(--text)' }}>You're in the Home Screen app.</strong>
                  <br />
                  Enter your email above and tap <em>Send Magic Link</em>. The link in your email
                  will open in Safari — tap it there, then <strong>return to this app</strong> from
                  your home screen. You'll be signed in automatically.
                </>
              ) : (
                <>
                  <strong style={{ color: 'var(--text)' }}>For the best sign-in experience:</strong>
                  <br />
                  Sign in here in Safari <em>first</em>, then use the Share button → <em>Add to Home Screen</em>.
                  Your session will carry over. If you're already using the home screen app, open this
                  page in Safari to sign in, then reopen from your home screen.
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
