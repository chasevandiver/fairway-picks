'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function AuthPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  // OTP code flow for PWA — user types the 6-digit code instead of clicking the link
  const [otp, setOtp] = useState('')
  const [otpLoading, setOtpLoading] = useState(false)
  const [otpError, setOtpError] = useState<string | null>(null)

  useEffect(() => {
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      // No emailRedirectTo — sends a code-only email with no magic link.
      // Magic links get prefetched by email clients (Gmail, Apple Mail),
      // which consumes the token before the user can type it.
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault()
    setOtpLoading(true)
    setOtpError(null)

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp.trim(),
      type: 'email',
    })

    if (error) {
      setOtpError(error.message)
    }
    // On success, onAuthStateChange in the app fires and handles navigation
    setOtpLoading(false)
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <h1>Fore <span>Picks</span></h1>
          <p>PGA TOUR PICK'EM LEAGUE</p>
        </div>

        {!sent ? (
          <>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block', color: 'var(--text-dim)', fontSize: 12, marginBottom: 6,
                  fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={{
                    width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
              {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Sending…' : 'Send Code'}
              </button>
            </form>
            <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 12, marginTop: 16 }}>
              We'll email you a 6-digit code to sign in.
            </p>
          </>
        ) : (
          <>
            <p style={{ textAlign: 'center', color: 'var(--green)', marginBottom: 6, fontWeight: 600 }}>
              Check your email!
            </p>
            <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
              Sent to <strong style={{ color: 'var(--text)' }}>{email}</strong>.
              Enter the 6-digit code below.
            </p>

            <form onSubmit={handleOtp}>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={otp}
                onChange={(e) => setOtp(e.target.value.trim())}
                placeholder="123456"
                required
                style={{
                  width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, padding: '12px 14px', color: 'var(--text)', fontSize: 24,
                  outline: 'none', boxSizing: 'border-box', textAlign: 'center',
                  letterSpacing: '0.3em', fontFamily: 'var(--font-mono)', marginBottom: 12,
                }}
              />
              {otpError && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{otpError}</p>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={otpLoading || otp.length < 4}>
                {otpLoading ? 'Verifying…' : 'Sign In'}
              </button>
            </form>

            <button
              className="btn btn-outline"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => { setSent(false); setOtp(''); setOtpError(null) }}
            >
              Use a different email
            </button>
          </>
        )}
      </div>
    </div>
  )
}
