'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface League {
  id: string
  name: string
  invite_code: string
  created_at: string
  rules: {
    picks_per_player: number
    scoring: { weekly_winner: number; outright_winner: number; top3_bonus: number }
  }
}

export default function Dashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [leagues, setLeagues] = useState<League[]>([])
  const [profile, setProfile] = useState<{ display_name: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single()
      setProfile(prof)

      const { data: memberships } = await supabase
        .from('league_members')
        .select('leagues(id, name, invite_code, created_at, rules)')
        .eq('user_id', user.id)

      const leagueList = (memberships ?? [])
        .map((m: any) => m.leagues)
        .filter(Boolean)

      setLeagues(leagueList)

      // If user has exactly one league, redirect directly to it
      if (leagueList.length === 1) {
        router.push(`/league/${leagueList[0].id}`)
        return
      }

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spin" style={{ fontSize: 32 }}>⛳</div>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 24px', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
          Hey, {profile?.display_name} 👋
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>Your leagues</p>
      </div>

      {leagues.length === 0 ? (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⛳</div>
            <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 8 }}>
              You're not in any leagues yet
            </p>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 24 }}>
              Create a league and invite your friends, or ask for an invite link.
            </p>
            <button className="btn btn-primary" onClick={() => router.push('/create')}>
              Create a League
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {leagues.map((league) => (
            <button
              key={league.id}
              onClick={() => router.push(`/league/${league.id}`)}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '20px 24px',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'var(--text)',
                transition: 'all 0.15s',
              }}
              className="expandable-player-btn"
            >
              <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 6 }}>{league.name}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                  {league.rules?.picks_per_player ?? 4} picks/player
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                  ${league.rules?.scoring?.weekly_winner ?? 10}/player winner
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>
                  Code: {league.invite_code}
                </span>
              </div>
            </button>
          ))}

          <button
            onClick={() => router.push('/create')}
            style={{
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              padding: '20px 24px',
              cursor: 'pointer',
              color: 'var(--text-dim)',
              fontSize: 14,
              textAlign: 'center',
              transition: 'all 0.15s',
            }}
          >
            + Create another league
          </button>
        </div>
      )}
    </div>
  )
}
