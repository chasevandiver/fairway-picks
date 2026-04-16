'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import {
  toRelScore, scoreClass, formatMoney, moneyClass,
  buildPickMap, computeStandings,
} from '@/lib/scoring'
import type { GolferScore, PlayerStanding } from '@/lib/types'

interface LeagueData {
  leagueName: string
  leagueId: string
  inviteCode: string
  activeTournament: any | null
  seasonMoney: any[]
  results: any[]
  picks: any[]
}

// ─── Golfer Position Badge ────────────────────────────────────────────────────
function GolferBadge({ g }: { g: any }) {
  const isCut = g?.status === 'cut'
  const isWD = g?.status === 'wd'
  const pos = g?.position ?? '—'
  const posNum = parseInt(pos.replace(/^T/, ''))
  const isFirst = posNum === 1
  const isTop3 = !isNaN(posNum) && posNum >= 1 && posNum <= 3
  const label = isCut ? 'CUT' : isWD ? 'WD' : pos
  const color = isCut || isWD ? 'var(--red)' : isFirst ? 'var(--gold)' : isTop3 ? 'var(--green)' : 'var(--text)'
  const bg = isCut || isWD ? 'rgba(248,113,113,0.1)' : isFirst ? 'rgba(245,158,11,0.12)' : isTop3 ? 'rgba(74,222,128,0.10)' : 'var(--surface)'
  const borderColor = isCut || isWD ? 'rgba(248,113,113,0.25)' : isFirst ? 'rgba(245,158,11,0.3)' : isTop3 ? 'rgba(74,222,128,0.25)' : 'var(--border)'
  return (
    <div style={{
      fontFamily: 'DM Mono', fontSize: 11, fontWeight: 600, color,
      background: bg, border: `1px solid ${borderColor}`,
      borderRadius: 6, padding: '2px 6px', minWidth: 28, textAlign: 'center',
    }}>
      {label}
    </div>
  )
}

// ─── Expandable Player Card ───────────────────────────────────────────────────
function PlayerCard({
  standing, liveData, pickMap
}: {
  standing: PlayerStanding
  liveData: GolferScore[]
  pickMap: Record<string, string[]>
}) {
  const [expanded, setExpanded] = useState(false)
  const par = liveData[0]?.par ?? 72

  const pickedGolfers = (pickMap[standing.player] ?? []).map(name => {
    const g = standing.golfers.find((x: any) => x.name.toLowerCase() === name.toLowerCase())
    const live = liveData.find(d => d.name.toLowerCase() === name.toLowerCase())
    if (live && g) return { ...g, ...live, adjScore: g.adjScore, displayRounds: g.displayRounds }
    return live || g || { name, score: null, today: null, thru: '—', position: '—', status: 'active', rounds: [null,null,null,null] }
  })

  const todayScores = pickedGolfers.map((g: any) => g?.today).filter((t: any) => t != null)
  const todayTotal = todayScores.length > 0 ? todayScores.reduce((s: number, t: number) => s + t, 0) : null
  const rank = standing.rank
  const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`
  const rankStyle = rank === 1
    ? { color: 'var(--gold)', fontWeight: 800, fontSize: 18 }
    : rank === 2 ? { color: '#c0c0c0', fontWeight: 700, fontSize: 16 }
    : rank === 3 ? { color: '#cd7f32', fontWeight: 700, fontSize: 16 }
    : { color: 'var(--text-dim)', fontWeight: 600, fontSize: 14, fontFamily: 'DM Mono' }

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '12px 16px',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 8, color: 'var(--text)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'Sora, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <div style={{ ...rankStyle, width: 32, textAlign: 'center', flexShrink: 0 }}>{rankIcon}</div>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{standing.player}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {pickedGolfers.map((g: any) => <GolferBadge key={g?.name} g={g} />)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {todayTotal !== null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Today</div>
              <div className={`score ${scoreClass(todayTotal)}`} style={{ fontSize: 14, fontFamily: 'DM Mono', fontWeight: 600 }}>
                {toRelScore(todayTotal)}
              </div>
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'DM Mono', fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Total</div>
            <div className={`score ${scoreClass(standing.totalScore)}`} style={{ fontSize: 18, fontFamily: 'DM Mono', fontWeight: 700 }}>
              {toRelScore(standing.totalScore)}
            </div>
          </div>
          <span style={{ fontSize: 14, color: 'var(--text-dim)', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </button>

      {expanded && (
        <div style={{ marginTop: 4, padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Golfer', 'R1', 'R2', 'R3', 'R4', 'Total'].map((h, i) => (
                  <th key={h} style={{ padding: i === 0 ? '8px 12px' : '8px 8px', textAlign: i === 0 ? 'left' : 'center', fontFamily: 'DM Mono', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pickedGolfers.map((g: any) => {
                const rounds: (number | null)[] = g.displayRounds || g.rounds || [null, null, null, null]
                return (
                  <tr key={g.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500, fontSize: 13 }}>{g.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'DM Mono', marginTop: 2 }}>
                        #{g.position}
                        {g.status === 'cut' && <span style={{ marginLeft: 6, color: 'var(--red)' }}>CUT</span>}
                        {g.status === 'wd' && <span style={{ marginLeft: 6, color: 'var(--text-dim)' }}>WD</span>}
                      </div>
                    </td>
                    {rounds.map((r: number | null, i: number) => {
                      const toPar = r !== null ? r - par : null
                      const thruNum = parseInt(g.thru)
                      const priorComplete = rounds.slice(0, i).every((x: number | null) => x !== null)
                      const laterEmpty = rounds.slice(i + 1).every((x: number | null) => x === null)
                      const isInProgress = r === null && priorComplete && laterEmpty &&
                        !isNaN(thruNum) && thruNum > 0 && g.status === 'active'
                      return (
                        <td key={i} style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <div style={{ fontFamily: 'DM Mono', fontSize: 14, fontWeight: 500 }}>
                            {r !== null ? r : (isInProgress ? '*' : '—')}
                          </div>
                          <div className={`score ${isInProgress ? scoreClass(g.today) : scoreClass(toPar)}`} style={{ fontSize: 9, marginTop: 1 }}>
                            {isInProgress && g.today !== null
                              ? `${toRelScore(g.today)} thru ${g.thru}`
                              : (toPar !== null ? toRelScore(toPar) : '')}
                          </div>
                        </td>
                      )
                    })}
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div className={`score ${scoreClass(g.adjScore ?? g.score)}`} style={{ fontSize: 16, fontFamily: 'DM Mono', fontWeight: 700 }}>
                        {toRelScore(g.adjScore ?? g.score)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// This page NEVER redirects — the URL must stay stable so iPhone "Add to Home
// Screen" bookmarks keep working. Signed-in members get an "Open Full App"
// button; everyone else sees live scores and can join from here.
export default function LeaguePage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [data, setData] = useState<LeagueData | null>(null)
  const [liveData, setLiveData] = useState<GolferScore[]>([])
  const [loading, setLoading] = useState(true)
  const [scoresLoading, setScoresLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // After auth check: is this a signed-in member who can open the full app?
  const [isMember, setIsMember] = useState(false)

  const fetchScores = useCallback(async (hasTournament: boolean) => {
    if (!hasTournament) return
    setScoresLoading(true)
    try {
      const scores: GolferScore[] = await fetch('/api/scores').then(r => r.json())
      setLiveData(scores)
      setLastUpdated(new Date())
    } catch {}
    setScoresLoading(false)
  }, [])

  // Load league data and check membership in parallel
  useEffect(() => {
    const leagueReq = fetch(`/api/league-data?league_id=${params.id}`).then(r => r.json())
    const authReq = supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return false
      const { data: member } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('league_id', params.id)
        .eq('user_id', user.id)
        .maybeSingle()
      return !!member
    })

    Promise.all([leagueReq, authReq]).then(([d, member]) => {
      setData(d)
      setIsMember(member)
      fetchScores(!!d.activeTournament)
    }).finally(() => setLoading(false))
  }, [params.id])

  // Auto-refresh scores every 2 minutes when a tournament is active
  useEffect(() => {
    if (!data?.activeTournament) return
    const iv = setInterval(() => fetchScores(true), 120_000)
    return () => clearInterval(iv)
  }, [data?.activeTournament, fetchScores])

  const pickMap = data ? buildPickMap(data.picks) : {}
  const participants = data?.activeTournament?.draft_order ?? []
  const standings = computeStandings(liveData, pickMap, participants.length > 0 ? participants : undefined)
  const seasonSorted = [...(data?.seasonMoney ?? [])].sort((a, b) => b.total - a.total)
  const leagueName = data?.leagueName ?? 'League'
  const inviteCode = data?.inviteCode ?? ''
  const par = liveData[0]?.par ?? 72
  const tournament = data?.activeTournament ?? null

  const history: any[] = []
  if (data?.results?.length) {
    const grouped: Record<string, any> = {}
    for (const r of data.results) {
      const tid = r.tournament_id
      if (!grouped[tid]) grouped[tid] = { name: r.tournaments?.name, date: r.tournaments?.date, money: {}, winner: null }
      grouped[tid].money[r.player_name] = r.money_won
      if (r.rank === 1) grouped[tid].winner = r.player_name
    }
    history.push(...Object.values(grouped).sort((a: any, b: any) => b.date?.localeCompare(a.date)))
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spin" style={{ fontSize: 32 }}>⛳</div>
        Loading league…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Header ── */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: 'DM Serif Display', fontSize: 20, color: 'var(--text)' }}>
              Fore<span style={{ color: 'var(--green)' }}>Picks</span>
            </span>
          </a>
          <span style={{ color: 'var(--border)', fontSize: 16 }}>|</span>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{leagueName}</span>
        </div>

        {/* Member: show "Open Full App" — Guest: show "Join League" */}
        {isMember ? (
          <a
            href="/"
            onClick={() => {
              try { localStorage.setItem('activeLeagueId', params.id) } catch {}
            }}
            style={{
              background: 'var(--green)', color: '#000', fontWeight: 700, fontSize: 12,
              padding: '7px 14px', borderRadius: 8, textDecoration: 'none',
              fontFamily: 'DM Mono', letterSpacing: '0.05em',
            }}
          >
            Open Full App →
          </a>
        ) : inviteCode ? (
          <a
            href={`/join/${inviteCode}`}
            style={{
              background: 'var(--green)', color: '#000', fontWeight: 700, fontSize: 12,
              padding: '7px 14px', borderRadius: 8, textDecoration: 'none',
              fontFamily: 'DM Mono', letterSpacing: '0.05em',
            }}
          >
            Join League →
          </a>
        ) : null}
      </div>

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── No active tournament ── */}
        {!tournament && (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⛳</div>
            <div style={{ fontFamily: 'DM Serif Display', fontSize: 22, marginBottom: 8 }}>No active tournament</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>Check back when the next PGA Tour event kicks off.</div>
          </div>
        )}

        {/* ── Live leaderboard ── */}
        {tournament && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontFamily: 'DM Serif Display', fontSize: 22 }}>{tournament.name}</div>
                <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                  {tournament.course} · {tournament.date} · Par {par}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {lastUpdated && (
                  <span style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>
                    Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button className="refresh-btn" onClick={() => fetchScores(true)} disabled={scoresLoading}>
                  <span className={scoresLoading ? 'spin' : ''}>↻</span>
                  {scoresLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </div>

            {standings.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>Draft hasn't started yet. Check back soon!</div>
              </div>
            ) : (
              standings.map(s => (
                <PlayerCard key={s.player} standing={s} liveData={liveData} pickMap={pickMap} />
              ))
            )}
          </div>
        )}

        {/* ── Season standings ── */}
        {seasonSorted.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header"><div className="card-title">Season Standings</div></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                {seasonSorted.map((sm: any, i: number) => (
                  <div key={sm.player_name} className={`money-card glass-card${i === 0 ? ' gradient-card-gold leader-glow' : i === 1 ? ' gradient-card-green' : ''}`}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{sm.player_name}
                    </div>
                    <div className={`money-amount ${moneyClass(sm.total)}`}>{formatMoney(sm.total)}</div>
                    <div style={{ fontFamily: 'DM Mono', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Season Total</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── History ── */}
        {history.length > 0 && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header"><div className="card-title">Tournament History</div></div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tournament</th>
                    <th>Winner</th>
                    {Object.keys(history[0].money).map((p: string) => <th key={p}>{p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: any, i: number) => (
                    <tr key={i} className="row">
                      <td>
                        <div style={{ fontWeight: 500 }}>{h.name}</div>
                        <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--text-dim)' }}>{h.date}</div>
                      </td>
                      <td><div style={{ fontWeight: 600, color: 'var(--gold)' }}>{h.winner ?? '—'}</div></td>
                      {Object.entries(h.money).map(([p, v]: [string, any]) => (
                        <td key={p}>
                          <span className={`score ${v > 0 ? 'under' : v < 0 ? 'over' : 'even'}`} style={{ fontSize: 13 }}>
                            {formatMoney(v)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Footer CTA (guests only) ── */}
        {!isMember && (
          <div style={{ textAlign: 'center', padding: '24px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'DM Serif Display', fontSize: 18, marginBottom: 8 }}>Want to play?</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
              Join <strong style={{ color: 'var(--text)' }}>{leagueName}</strong> or start your own league.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {inviteCode && (
                <a href={`/join/${inviteCode}`} className="btn btn-primary" style={{ textDecoration: 'none', fontSize: 14 }}>
                  Join this League
                </a>
              )}
              <a href="/" className="btn btn-outline" style={{ textDecoration: 'none', fontSize: 14 }}>
                Create a League
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
