'use client'

import type { Tournament } from '@/lib/types'
import { NAV_ITEMS } from '@/lib/constants'

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar({
  currentPlayer, tab, setTab, isAdmin, onLogout, tournament, isOpen, onClose, isMasters, leagueName, onClaimPlayer, showClaim
}: {
  currentPlayer: string
  tab: string
  setTab: (t: string) => void
  isAdmin: boolean
  onLogout: () => void
  tournament: Tournament | null
  isOpen: boolean
  onClose: () => void
  isMasters: boolean
  leagueName: string
  onClaimPlayer?: () => void
  showClaim?: boolean
}) {
  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            display: 'none',
            position: 'fixed', inset: 0, zIndex: 99,
            background: 'rgba(0,0,0,0.5)',
          }}
          className="sidebar-overlay"
        />
      )}
    <div className={`sidebar${isOpen ? ' open' : ''}`}>
      <button className="sidebar-close-btn" onClick={onClose} style={{ display: 'none' }}>✕</button>
      <div className="sidebar-logo">
        {isMasters ? (
          <>
            <div style={{ fontFamily: "'Pinyon Script', cursive", fontSize: 38, color: 'white', lineHeight: 1.1 }}>
              The Masters
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 6 }}>
              Augusta National · 2026
            </p>
          </>
        ) : (
          <>
            <h1>Fore <span>Picks</span></h1>
            <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {leagueName}
            </p>
          </>
        )}
      </div>

      <nav className="sidebar-nav">
        <div className="nav-label">Navigation</div>
        {NAV_ITEMS.filter(i => !i.adminOnly || isAdmin).map(item => (
          <button
            key={item.key}
            className={`nav-item ${tab === item.key ? 'active' : ''}`}
            onClick={() => { setTab(item.key); onClose() }}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}

        {tournament && (
          <>
            <div className="nav-label" style={{ marginTop: 24 }}>Active</div>
            <div className="tournament-pill" style={{ margin: '0 0 0 0', width: '100%' }}>
              <div className="live-dot" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tournament.name}
              </span>
            </div>
          </>
        )}
      </nav>

      <div style={{ padding: '0 12px 12px' }}>
        <a
          href="/dashboard"
          style={{
            display: 'block', width: '100%', textAlign: 'center',
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 0', color: 'var(--text-dim)',
            fontSize: 12, fontFamily: 'var(--font-mono)', textDecoration: 'none',
            letterSpacing: '0.05em',
          }}
        >
          ⇄ Switch League
        </a>
      </div>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">{currentPlayer[0]}</div>
          <div className="user-info">
            <div className="user-name">{currentPlayer}</div>
            <div className="user-role">{isAdmin ? 'Admin' : 'Player'}</div>
          </div>
          <button
            onClick={onLogout}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16 }}
            title="Switch player"
          >↩</button>
        </div>
        {showClaim && onClaimPlayer && (
          <button
            type="button"
            onClick={onClaimPlayer}
            style={{
              marginTop: 8, width: '100%', background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, padding: '7px 10px', color: 'var(--green)', fontSize: 12,
              cursor: 'pointer', fontFamily: 'var(--font-mono)', textAlign: 'center',
            }}
          >
            Claim your player name →
          </button>
        )}
      </div>
    </div>
    </>
  )
}
