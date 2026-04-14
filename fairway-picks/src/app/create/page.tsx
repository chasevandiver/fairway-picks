'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { DEFAULT_RULES, mergeRules } from '@/lib/rules'

type Mode = 'choose' | 'quick' | 'custom' | 'done'

function generateInviteCode(): string {
  // Avoids confusable chars (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function CreateLeague() {
  const supabase = createClient()
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('choose')
  const [leagueName, setLeagueName] = useState('')
  const [picksPerPlayer, setPicksPerPlayer] = useState(4)
  const [weeklyWinner, setWeeklyWinner] = useState(10)
  const [outrightWinner, setOutrightWinner] = useState(10)
  const [top3Bonus, setTop3Bonus] = useState(5)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdInviteCode, setCreatedInviteCode] = useState('')
  const [copied, setCopied] = useState(false)

  async function createLeague(customRules = false) {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { sessionStorage.setItem('pending_redirect', '/create'); router.push('/auth'); return }

    const rules = mergeRules(customRules ? {
      picks_per_player: picksPerPlayer,
      scoring: { weekly_winner: weeklyWinner, outright_winner: outrightWinner, top3_bonus: top3Bonus },
    } : {})

    // Generate a unique invite code (retry up to 5 times on collision)
    let inviteCode = ''
    for (let i = 0; i < 5; i++) {
      const candidate = generateInviteCode()
      const { data: existing } = await supabase.from('leagues').select('id').eq('invite_code', candidate).maybeSingle()
      if (!existing) { inviteCode = candidate; break }
    }
    if (!inviteCode) { setError('Failed to generate invite code. Try again.'); setLoading(false); return }

    // Create the league
    const { data: league, error: leagueErr } = await supabase
      .from('leagues')
      .insert({ name: leagueName.trim() || 'My League', invite_code: inviteCode, commissioner_id: user.id, rules })
      .select()
      .single()

    if (leagueErr || !league) { setError(leagueErr?.message ?? 'Failed to create league'); setLoading(false); return }

    // Add creator as a member
    await supabase.from('league_members').insert({ league_id: league.id, user_id: user.id })

    setCreatedInviteCode(inviteCode)
    setMode('done')
    setLoading(false)
  }

  function copyInviteLink() {
    const url = `${location.origin}/join/${createdInviteCode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (mode === 'done') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ maxWidth: 480 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>League Created!</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
              Share this link with your friends to invite them.
            </p>
          </div>

          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
              Invite Code
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: 'var(--green)', letterSpacing: '0.2em' }}>
              {createdInviteCode}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              {location.origin}/join/{createdInviteCode}
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={copyInviteLink}>
            {copied ? '✓ Copied!' : 'Copy Invite Link'}
          </button>
          <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => router.push('/')}>
            Go to My League
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'choose') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ maxWidth: 480 }}>
          <div className="login-logo">
            <h1>Fore <span>Picks</span></h1>
            <p>Create Your League</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => setMode('quick')}
              style={{
                background: 'var(--surface2)',
                border: '2px solid var(--green)',
                borderRadius: 12,
                padding: '20px',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--green)' }}>
                ⚡ Quick Start
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                Use our proven rules. Takes 30 seconds.
              </div>
              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['4 picks/player', 'Snake draft', '$10 winner', '$5 top-3'].map(tag => (
                  <span key={tag} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', color: 'var(--text-dim)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </button>

            <button
              onClick={() => setMode('custom')}
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '20px',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                ⚙️ Custom League
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                Set your own scoring, roster size, and payouts. Takes 3 minutes.
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'quick') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ maxWidth: 480 }}>
          <button onClick={() => setMode('choose')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0 }}>
            ← Back
          </button>
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Name Your League</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>You can always change this later.</p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: 12, marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              League Name
            </label>
            <input
              type="text"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              placeholder="My Golf League"
              maxLength={50}
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Default Rules</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                ['Picks per player', '4 golfers'],
                ['Draft format', 'Snake'],
                ['Weekly winner', '$10/player'],
                ['Tour winner bonus', '$10/player'],
                ['Top-3 golfer bonus', '$5/player'],
              ].map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-dim)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontWeight: 600 }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading} onClick={() => createLeague(false)}>
            {loading ? 'Creating…' : 'Create League'}
          </button>
        </div>
      </div>
    )
  }

  // Custom mode
  return (
    <div className="login-screen">
      <div className="login-card" style={{ maxWidth: 520 }}>
        <button onClick={() => setMode('choose')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13, marginBottom: 16, padding: 0 }}>
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Customize Your League</h2>

        {/* League Name */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: 'var(--text-dim)', fontSize: 12, marginBottom: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            League Name
          </label>
          <input
            type="text"
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            placeholder="My Golf League"
            maxLength={50}
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Roster */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Roster</div>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <span>Golfers per player</span>
            <select
              value={picksPerPlayer}
              onChange={(e) => setPicksPerPlayer(Number(e.target.value))}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }}
            >
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        {/* Scoring */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Payouts ($ per other player)</div>
          {[
            { label: 'Weekly winner (lowest strokes)', value: weeklyWinner, set: setWeeklyWinner, min: 0, max: 100 },
            { label: 'Tour winner bonus (picked #1 finisher)', value: outrightWinner, set: setOutrightWinner, min: 0, max: 100 },
            { label: 'Top-3 golfer bonus (per golfer)', value: top3Bonus, set: setTop3Bonus, min: 0, max: 50 },
          ].map(({ label, value, set, min, max }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
              <span style={{ color: 'var(--text-dim)', flex: 1, marginRight: 12 }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)', fontWeight: 700, minWidth: 32, textAlign: 'right' }}>${value}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={5}
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  style={{ width: 80 }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, padding: 0 }}
        >
          {showAdvanced ? '▼' : '▶'} Advanced Settings
        </button>

        {showAdvanced && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
              Cut penalties, WD handling, major multipliers, and tiebreakers use proven defaults. These can be adjusted post-launch.
            </p>
          </div>
        )}

        {/* Max payout preview */}
        <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
          <span style={{ color: 'var(--text-dim)' }}>With 5 players, max weekly win: </span>
          <span style={{ color: 'var(--green)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            ${(weeklyWinner + outrightWinner + top3Bonus * picksPerPlayer) * 4}
          </span>
        </div>

        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={loading} onClick={() => createLeague(true)}>
          {loading ? 'Creating…' : 'Create League'}
        </button>
      </div>
    </div>
  )
}
