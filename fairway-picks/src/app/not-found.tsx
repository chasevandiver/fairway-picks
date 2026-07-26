import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 40 }}>🏌️</div>
      <h2 style={{ fontSize: 18, fontWeight: 600 }}>Out of bounds</h2>
      <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
        That page doesn't exist. Take a drop and head back to the fairway.
      </p>
      <Link href="/" className="btn btn-primary">Back to the leaderboard</Link>
    </div>
  )
}
