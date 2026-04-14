'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
      <a href="/" style={{ color: 'var(--text-dim)', fontSize: 12, textDecoration: 'none' }}>
        Back to home
      </a>
    </div>
  )
}
