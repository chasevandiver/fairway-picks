'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { buildPickMap, computeStandings, computeMoney } from '@/lib/scoring'
import { DEFAULT_RULES, mergeRules } from '@/lib/rules'
import type { LeagueRules } from '@/lib/rules'
import type { Tournament, Pick, GolferScore, SeasonMoney } from '@/lib/types'
import { FOUNDING_LEAGUE_ID } from '@/lib/founding'
import { getLeagueRoster, type LeagueMember } from '@/lib/roster'
import LandingPage from '@/components/Landing'
import { LEGACY_PLAYERS } from '@/lib/constants'
import { SkeletonScreen } from '@/components/app/SkeletonScreen'
import { SetupProfileScreen } from '@/components/app/SetupProfileScreen'
import { ClaimPlayerModal } from '@/components/app/ClaimPlayerModal'
import { Sidebar } from '@/components/app/Sidebar'
import { LeaderboardTab } from '@/components/tabs/LeaderboardTab'
import { PicksTab } from '@/components/tabs/PicksTab'
import { MoneyTab } from '@/components/tabs/MoneyTab'
import { DraftTab } from '@/components/tabs/DraftTab'
import { AdminTab } from '@/components/tabs/AdminTab'
import { HistoryTab } from '@/components/tabs/HistoryTab'
import { StatsTab } from '@/components/tabs/StatsTab'
import { SeasonRecapTab } from '@/components/tabs/SeasonRecapTab'
import { Toast, type ToastState } from '@/components/app/Toast'

export default function App() {
  const supabase = createClient()
  const router = useRouter()

  // Handle both auth flows:
  // - Implicit flow: /#access_token=... (detectSessionInUrl:true handles automatically, just clean hash)
  // - PKCE flow: /?code=... (flowType:'implicit' may be ignored in supabase-js v2.44+, still sends PKCE)
  useEffect(() => {
    if (window.location.hash.includes('access_token')) {
      window.history.replaceState(null, '', window.location.pathname)
      return
    }
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        window.history.replaceState(null, '', window.location.pathname)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null)
  const [tab, setTab] = useState('live')
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [liveData, setLiveData] = useState<GolferScore[]>([])
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({})
  const [seasonMoney, setSeasonMoney] = useState<SeasonMoney[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [golferHistory, setGolferHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  // false when /api/scores served MOCK fallback data (ESPN outage/off-season).
  // Mock scores must never be finalized into results.
  const [isLiveData, setIsLiveData] = useState(true)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [tabKey, setTabKey] = useState(0)
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [userProfile, setUserProfile] = useState<{ display_name: string; is_admin: boolean } | null>(null)
  // No default league — set only after auth resolves to a real membership.
  // Prevents the "auto-load original league for non-members" leak.
  const [leagueId, setLeagueId] = useState<string>('')
  const [leagueName, setLeagueName] = useState<string>('Fore Picks')
  const [leagueRules, setLeagueRules] = useState<LeagueRules>(DEFAULT_RULES)
  const [inviteCode, setInviteCode] = useState<string>('')
  const [commissionerId, setCommissionerId] = useState<string | null>(null)
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [guestMode, setGuestMode] = useState(false)

  // Admin if: super-admin flag on profile (DB-controlled, backfilled by
  // migration 008), OR commissioner of THIS league. Name-based fallbacks are
  // gone — a display name is not a credential.
  const isAdmin =
    (userProfile?.is_admin ?? false) ||
    (commissionerId !== null && commissionerId === user?.id)
  const isMasters = !!(tournament?.name?.toLowerCase().includes('masters'))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showClaimModal, setShowClaimModal] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  // Tracks whether we've completed the initial profile load for the current user.
  // Used to prevent TOKEN_REFRESHED events from clearing already-loaded state.
  const profileLoadedRef = useRef(false)
  // Dedupes /api/init-user across duplicate auth events. supabase-js refires
  // SIGNED_IN on tab focus, INITIAL_SESSION at mount, etc. — without this
  // guard init-user was being hit several times per second per session.
  const initedUserIdRef = useRef<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback((message: string, type: ToastState['type'] = 'error') => {
    setToast({ message, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // Apply Masters theme to body when Masters tournament is active
  useEffect(() => {
    if (isMasters) {
      document.body.setAttribute('data-theme', 'masters')
    } else {
      document.body.removeAttribute('data-theme')
    }
    return () => document.body.removeAttribute('data-theme')
  }, [isMasters])

  // Tab change with animation reset
  const handleTabChange = useCallback((t: string) => {
    setTab(t)
    setTabKey(k => k + 1)
    setSidebarOpen(false)
  }, [])

  // ── Auth state management ──
  useEffect(() => {
    // Load a league read-only via the public-view path. Used when there is no
    // session (guest) and as the fallback when auth is slow — a returning
    // visitor with a saved league should see the leaderboard instantly, never
    // the landing page.
    const loadGuestLeague = async (): Promise<boolean> => {
      const savedLeagueId = localStorage.getItem('activeLeagueId')
      if (!savedLeagueId) return false
      const res = await fetch(`/api/league-data?league_id=${savedLeagueId}`).then(r => r.json()).catch(() => null)
      if (!res || res.error) return false
      setLeagueId(savedLeagueId)
      if (res.leagueName) setLeagueName(res.leagueName)
      if (res.leagueRules) setLeagueRules(mergeRules(res.leagueRules))
      if (res.inviteCode) setInviteCode(res.inviteCode)
      setGuestMode(true)
      return true
    }

    // Shared post-sign-in init used by the getSession() path and the
    // onAuthStateChange path (previously two diverging copies of this logic).
    // Returns false when a transient error means state shouldn't change.
    const initAuthedUser = async (session: any): Promise<void> => {
      const u = { id: session.user.id, email: session.user.email ?? '' }
      setUser(u)
      // Dedupe: SIGNED_IN refires on tab focus, INITIAL_SESSION on mount —
      // without this we'd re-hit /api/init-user constantly.
      if (initedUserIdRef.current === u.id) {
        setBootstrapped(true)
        return
      }
      initedUserIdRef.current = u.id

      const storedLeague = localStorage.getItem('activeLeagueId')
      const initUrl = storedLeague
        ? `/api/init-user?preferred_league_id=${storedLeague}`
        : '/api/init-user'
      const res = await fetch(initUrl, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).then(r => r.json()).catch(() => null)
      const { profile, membership } = res ?? {}

      if (profile) {
        profileLoadedRef.current = true
        setUserProfile(profile)
        setCurrentPlayer(profile.display_name)
        setGuestMode(false)
        if (membership) {
          setLeagueId(membership.league_id)
          localStorage.setItem('activeLeagueId', membership.league_id)
          const l = membership.leagues as any
          if (l) {
            setLeagueName(l.name)
            setLeagueRules(mergeRules(l.rules ?? {}))
            setCommissionerId(l.commissioner_id ?? null)
          }
        } else {
          // Signed in but not a member of any league — send to Dashboard
          // to create or join one. Never auto-load the original league.
          localStorage.removeItem('activeLeagueId')
          router.replace('/dashboard')
          return
        }
      } else if (!profileLoadedRef.current) {
        // Genuinely new user with no profile — SetupProfileScreen shows.
        // (If the fetch failed transiently for an already-loaded user, state
        // is left alone so the app doesn't flash SetupProfileScreen.)
        if (res) {
          setUserProfile(null)
          setCurrentPlayer(null)
        } else {
          // init-user itself failed (network) — allow a retry on next event.
          initedUserIdRef.current = null
        }
      }
      setBootstrapped(true)
    }

    // Race getSession() against a timeout — supabase-js v2 sometimes does a
    // server-side token validation request inside getSession() which can hang.
    const sessionRace = Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('auth_timeout')), 4000)),
    ])

    sessionRace.then(async ({ data: { session } }: any) => {
      if (session?.user) {
        await initAuthedUser(session)
      } else {
        await loadGuestLeague()
        setBootstrapped(true)
      }
    }).catch(async () => {
      // Auth timed out. A device with a saved league still gets the live
      // leaderboard as a guest while onAuthStateChange catches up in the
      // background — slow hotel wifi must never mean a landing-page bounce.
      await loadGuestLeague()
      setBootstrapped(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // TOKEN_REFRESHED fires on tab focus, scroll, and every token expiry.
      // The user and profile haven't changed — skip to avoid flashing SetupProfileScreen.
      if (event === 'TOKEN_REFRESHED') return
      // INITIAL_SESSION usually duplicates what getSession() handled —
      // initAuthedUser's dedupe makes that a no-op. But when getSession()
      // timed out (guest fallback), INITIAL_SESSION may be the only event
      // carrying the persisted session, so it must be processed: it upgrades
      // the guest view to the signed-in app.
      if (event === 'INITIAL_SESSION' && !session?.user) return

      if (session?.user) {
        await initAuthedUser(session)
      } else {
        profileLoadedRef.current = false
        initedUserIdRef.current = null
        setUser(null)
        setUserProfile(null)
        setCurrentPlayer(null)
        setBootstrapped(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Fetch DB data when logged in (scoped to current league) ──
  const loadData = useCallback(async () => {
    // Single API call. Members send their token for the full payload
    // (including the invite code); guests get the public-view subset.
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}
    const leagueDataRes = await fetch(`/api/league-data?league_id=${leagueId}`, { headers })
      .then(r => r.json()).catch(() => null)

    if (leagueDataRes && !leagueDataRes.error) {
      const { activeTournament, seasonMoney: sm, results, golferResults, picks: p, inviteCode: ic, commissionerId: cid, members: mem } = leagueDataRes
      if (ic != null) setInviteCode(ic)
      if (cid !== undefined) setCommissionerId(cid)
      if (Array.isArray(mem)) setMembers(mem)

      if (sm) setSeasonMoney(sm)

      if (activeTournament) {
        setTournament(activeTournament)
        setPicks(p ?? [])
      } else {
        setTournament(null)
        setPicks([])
      }

      // Build history from results
      if (results?.length > 0) {
        const grouped: Record<string, any> = {}
        for (const r of results) {
          const tid = r.tournament_id
          if (!grouped[tid]) {
            grouped[tid] = {
              tournament_id: tid,
              tournament_name: r.tournaments?.name,
              date: r.tournaments?.date,
              is_major: r.tournaments?.is_major || false,
              standings: [],
              money: {},
              winner_player: null,
            }
          }
          grouped[tid].standings.push({
            player: r.player_name,
            score: r.total_score,
            rank: r.rank,
            has_winner: r.has_winner,
            has_top3: r.has_top3,
            golfers_cut: r.golfers_cut || 0,
          })
          grouped[tid].money[r.player_name] = r.money_won
          if (r.rank === 1) grouped[tid].winner_player = r.player_name
        }
        setHistory(Object.values(grouped))
      } else {
        setHistory([])
      }

      setGolferHistory(golferResults ?? [])
    } else {
      // A failed load used to be indistinguishable from an empty league.
      notify("Couldn't load league data. Pull to refresh or try again shortly.")
    }

    setDataLoaded(true)
  }, [leagueId, notify, supabase])

  useEffect(() => {
    // Only load data once we have a real leagueId — prevents requests
    // against an empty id during the auth bootstrap.
    if (!leagueId) return
    if (currentPlayer || guestMode) loadData()
  }, [currentPlayer, guestMode, loadData, leagueId])

  // ── Live score polling ──
  const fetchScores = useCallback(async () => {
    if (!tournament) return
    setLoading(true)
    try {
      const res = await fetch('/api/scores')
      const payload = await res.json()
      // New shape: { golfers, isLive, fetchedAt }. (Array fallback covers a
      // cached pre-upgrade response.)
      const data: GolferScore[] = Array.isArray(payload) ? payload : payload.golfers ?? []
      setIsLiveData(Array.isArray(payload) ? true : payload.isLive !== false)
      // Detect score changes for flash animation
      setLiveData(prev => {
        const newFlash: Record<string, 'up' | 'down'> = {}
        for (const g of data) {
          const old = prev.find(p => p.name === g.name)
          if (old && old.score !== null && g.score !== null && old.score !== g.score) {
            newFlash[g.name] = g.score < old.score ? 'up' : 'down'
          }
        }
        if (Object.keys(newFlash).length > 0) {
          setFlashMap(newFlash)
          setTimeout(() => setFlashMap({}), 1400)
        }
        return data
      })
      setLastUpdated(new Date())
    } catch {}
    setLoading(false)
  }, [tournament])

  useEffect(() => {
    if (tournament) {
      fetchScores()
      const interval = setInterval(fetchScores, 120_000)
      return () => clearInterval(interval)
    }
  }, [tournament, fetchScores])

  // ── Realtime subscriptions ──
  // Filtered to THIS league (and the active tournament's picks) — the old
  // unfiltered channel made every connected client of every league refetch on
  // any league's draft pick. Keyed on leagueId so a league switch resubscribes
  // with a fresh loadData closure.
  useEffect(() => {
    if (!leagueId || (!currentPlayer && !guestMode)) return
    const channel = supabase.channel(`league-${leagueId}`)
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'tournaments', filter: `league_id=eq.${leagueId}` },
      () => loadData())
    if (tournament?.id) {
      channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'picks', filter: `tournament_id=eq.${tournament.id}` },
        () => loadData())
    }
    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [leagueId, currentPlayer, guestMode, tournament?.id, loadData, supabase])

  // ── Computed (memoized — these recompute over the full field of ~150
  // golfers and previously ran on every render) ──
  // Active-week scoring uses the tournament's frozen rules_snapshot so a
  // mid-season rules edit can never retroactively change a week in play.
  const effectiveRules = useMemo(
    () => mergeRules(((tournament as any)?.rules_snapshot as Partial<LeagueRules>) ?? leagueRules),
    [tournament, leagueRules]
  )
  const roster = useMemo(
    () => getLeagueRoster({ leagueId, members, draftOrder: tournament?.draft_order }),
    [leagueId, members, tournament]
  )
  const pickMap = useMemo(() => buildPickMap(picks), [picks])
  const standings = useMemo(
    () => computeStandings(liveData, pickMap, roster, effectiveRules),
    [liveData, pickMap, roster, effectiveRules]
  )
  const weekMoney = useMemo(
    () => computeMoney(standings, roster, effectiveRules, (tournament as any)?.is_major ?? false),
    [standings, roster, effectiveRules, tournament]
  )

  // ── Handlers ──
  const handleLogout = async () => {
    await supabase.auth.signOut()
    // Full reload for a clean slate — the bootstrap will come back up in
    // guest mode for a public-view league (activeLeagueId is kept), instead
    // of leaving half-authenticated state behind.
    window.location.reload()
  }

  const handleSetupTournament = async (data: { name: string; course: string; date: string; draft_order: string[]; is_major: boolean }) => {
    // Get THIS league's active tournament so we can clear its picks. The
    // league_id filter is critical — without it this used to find (and
    // finalize, and delete the picks of) another league's active tournament.
    const { data: oldT } = await supabase
      .from('tournaments')
      .select('id')
      .eq('status', 'active')
      .eq('league_id', leagueId)
      .maybeSingle()
    if (oldT) {
      await supabase.from('picks').delete().eq('tournament_id', oldT.id)
      await supabase.from('tournaments').update({ status: 'finalized' }).eq('id', oldT.id)
    }
    const { data: t, error } = await supabase.from('tournaments').insert({ ...data, status: 'active', league_id: leagueId, rules_snapshot: leagueRules }).select().single()
    if (error || !t) {
      notify('Could not create the tournament. Please try again.')
      return
    }
    setTournament(t)
    setPicks([])
    await loadData()
    notify(`${t.name} is live — draft away!`, 'success')
  }

  const handlePickMade = async (golferName: string, playerName: string) => {
    if (!tournament) return
    const playerPicks = picks.filter((p) => p.player_name === playerName)
    const pickOrder = playerPicks.length + 1
    const { error } = await supabase.from('picks').insert({
      tournament_id: tournament.id,
      player_name: playerName,
      golfer_name: golferName,
      pick_order: pickOrder,
    })
    if (error) {
      notify(error.code === '23505'
        ? 'That pick was already made — the board just refreshed.'
        : 'Pick failed to save. Check your connection and try again.')
    }
    await loadData()
  }

  const handleFinalize = async () => {
    if (!tournament || !standings.length) return
    if (!isLiveData) {
      notify('Live scores are unavailable (showing placeholder data). Finalizing is disabled until the real feed is back.')
      return
    }
    const money = weekMoney

    // Insert results
    const resultRows = standings.map((s) => ({
      tournament_id: tournament.id,
      player_name: s.player,
      total_score: s.totalScore,
      rank: s.rank,
      has_winner: s.hasWinner,
      has_top3: s.top3Count > 0,
      money_won: money[s.player] || 0,
      golfers_cut: s.golfers.filter((g: any) => g.status === 'cut' || g.status === 'wd').length,
    }))
    const { error: resultsErr } = await supabase.from('results').upsert(resultRows, { onConflict: 'tournament_id,player_name' })
    if (resultsErr) {
      notify('Finalize failed while saving results — nothing was recorded. Try again.')
      return
    }

    // Save individual golfer results
    const golferRows: any[] = []
    for (const s of standings) {
      for (const g of s.golfers) {
        golferRows.push({
          tournament_id: tournament.id,
          player_name: s.player,
          golfer_name: g.name,
          position: g.position ?? '—',
          score: g.score ?? null,
          adj_score: g.adjScore ?? null,
          status: g.status ?? 'active',
          rounds: g.rounds ?? [],
        })
      }
    }
    const { error: golferErr } = await supabase.from('golfer_results').upsert(golferRows, { onConflict: 'tournament_id,player_name,golfer_name' })
    if (golferErr) notify('Results saved, but the golfer log failed to record.')

    // Season money is derived from results server-side — no running-total
    // writes needed (the drift-prone season_money table is display-legacy).

    const { error: finalErr } = await supabase.from('tournaments').update({ status: 'finalized' }).eq('id', tournament.id)
    if (finalErr) {
      notify('Results saved but the tournament could not be marked finalized. Try finalizing again.')
      return
    }
    setTournament(null)
    await loadData()
    notify('Week finalized and money recorded. 🏆', 'success')
  }

  const handleClearTournament = async () => {
    if (!tournament) return
    const { error } = await supabase.from('tournaments').delete().eq('id', tournament.id)
    if (error) { notify('Could not delete the tournament.'); return }
    setTournament(null)
    setPicks([])
    await loadData()
  }

  const handleClearPicks = async () => {
    if (!tournament) return
    const { error } = await supabase.from('picks').delete().eq('tournament_id', tournament.id)
    if (error) { notify('Could not clear picks.'); return }
    setPicks([])
  }

  const handleSwapGolfer = async (pickId: string, newGolferName: string) => {
    const { error } = await supabase.from('picks').update({ golfer_name: newGolferName }).eq('id', pickId)
    if (error) notify('Swap failed to save.')
    await loadData()
  }

  const handleDeleteTournament = async (tournamentId: string, _moneyByPlayer: Record<string, number>) => {
    // Season money is derived from results, so deleting the rows is enough.
    const { error: rErr } = await supabase.from('results').delete().eq('tournament_id', tournamentId)
    const { error: tErr } = await supabase.from('tournaments').delete().eq('id', tournamentId)
    if (rErr || tErr) notify('Delete did not fully complete — refresh and check the history tab.')
    await loadData()
  }

  const handleDeleteResult = async (tournamentId: string, playerName: string, moneyWon: number) => {
    const { error: rErr } = await supabase.from('results').delete()
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)
    const { error: gErr } = await supabase.from('golfer_results').delete()
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)
    if (rErr || gErr) notify('Delete did not fully complete — refresh and check the history tab.')
    await loadData()
  }

  const handleEditResult = async (tournamentId: string, playerName: string, field: 'total_score' | 'money_won', value: number) => {
    const { error } = await supabase.from('results')
      .update({ [field]: value })
      .eq('tournament_id', tournamentId)
      .eq('player_name', playerName)
    if (error) notify('Edit failed to save.')
    // Season money is derived from results server-side — reload picks it up.
    await loadData()
  }

  const handleSaveRules = async (newRules: Partial<LeagueRules>) => {
    const merged = mergeRules(newRules)
    // Commissioner-only under RLS. (Pre-008 this silently failed for the
    // founding league — commissioner_id was NULL — so surfacing the error
    // matters.)
    const { error } = await supabase.from('leagues').update({ rules: merged }).eq('id', leagueId)
    if (error) {
      notify('Could not save rules. Only the commissioner can change them.')
      return
    }
    setLeagueRules(merged)
    notify('League rules saved.', 'success')
  }

  const handleSaveInviteCode = async (code: string) => {
    // Direct update under the commissioner RLS policy (008). The old
    // /api/league-info route hardcoded the FOUNDING league id, so "saving"
    // a custom league's code silently rewrote the original league's.
    const cleaned = code.trim().toUpperCase()
    const { error } = await supabase.from('leagues')
      .update({ invite_code: cleaned })
      .eq('id', leagueId)
    if (error) {
      notify(error.code === '23505'
        ? 'That invite code is already taken — try another.'
        : 'Could not save the invite code. Only the commissioner can change it.')
      return
    }
    setInviteCode(cleaned)
    notify('Invite code updated.', 'success')
  }

  if (!bootstrapped) return <div className="loading-screen"><div className="spin" style={{ fontSize: 32 }}>⛳</div>Loading…</div>
  if (!user && !guestMode) return <LandingPage />
  if (user && !userProfile && !guestMode) return (
    <SetupProfileScreen
      supabase={supabase}
      userId={user.id}
      userEmail={user.email}
      onComplete={async (displayName) => {
        profileLoadedRef.current = true
        // is_admin comes from the server (init-user), never from the client.
        setUserProfile({ display_name: displayName, is_admin: false })
        setCurrentPlayer(displayName)
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const storedLeague = localStorage.getItem('activeLeagueId')
        const initUrl = storedLeague
          ? `/api/init-user?preferred_league_id=${storedLeague}`
          : '/api/init-user'
        fetch(initUrl, { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then(r => r.json())
          .then(({ profile, membership }) => {
            if (profile) setUserProfile(profile)
            if (membership) {
              setLeagueId(membership.league_id)
              localStorage.setItem('activeLeagueId', membership.league_id)
              const l = membership.leagues as any
              if (l) {
                setLeagueName(l.name)
                setLeagueRules(mergeRules(l.rules ?? {}))
                setCommissionerId(l.commissioner_id ?? null)
              }
            }
          })
          .catch(() => {})
      }}
    />
  )

  return (
    <div className="app-shell">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {/* Hamburger button — mobile only, hide when sidebar open */}
      {!sidebarOpen && (
        <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
          <span /><span /><span />
        </button>
      )}
      <Sidebar
        currentPlayer={currentPlayer ?? ''}
        tab={tab}
        setTab={handleTabChange}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        tournament={tournament}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMasters={isMasters}
        leagueName={leagueName}
        onClaimPlayer={() => setShowClaimModal(true)}
        showClaim={!!user && leagueId === FOUNDING_LEAGUE_ID && !LEGACY_PLAYERS.includes(currentPlayer ?? '')}
      />
      {showClaimModal && user && (
        <ClaimPlayerModal
          supabase={supabase}
          userId={user.id}
          userEmail={user.email}
          onComplete={(name) => {
            profileLoadedRef.current = true
            setCurrentPlayer(name)
            setUserProfile(prev => ({ display_name: name, is_admin: prev?.is_admin ?? false }))
            setShowClaimModal(false)
          }}
          onClose={() => setShowClaimModal(false)}
        />
      )}
      <main className="main-content">
        {!dataLoaded ? (
          <SkeletonScreen />
        ) : (
          <div key={tabKey} className="tab-content">
            {tab === 'live'    && <LeaderboardTab tournament={tournament} standings={standings} roster={roster} liveData={liveData} pickMap={pickMap} loading={loading} lastUpdated={lastUpdated} onRefresh={fetchScores} money={weekMoney} flashMap={flashMap} />}
            {tab === 'picks'   && <PicksTab standings={standings} pickMap={pickMap} liveData={liveData} tournament={tournament} roster={roster} />}
            {tab === 'money'   && <MoneyTab seasonMoney={seasonMoney} weekMoney={weekMoney} tournament={tournament} history={history} roster={roster} rules={effectiveRules} />}
            {tab === 'draft'   && <DraftTab tournament={tournament} picks={picks} liveData={liveData} currentPlayer={currentPlayer ?? ''} isAdmin={isAdmin} onPickMade={handlePickMade} picksPerPlayer={effectiveRules.picks_per_player} />}
            {tab === 'history' && <HistoryTab history={history} golferHistory={golferHistory} isAdmin={isAdmin} roster={roster} rules={leagueRules} onDeleteTournament={handleDeleteTournament} onEditResult={handleEditResult} onDeleteResult={handleDeleteResult} />}
            {tab === 'stats'   && <StatsTab history={history} leagueId={leagueId} />}
            {tab === 'recap'   && <SeasonRecapTab history={history} golferHistory={golferHistory} seasonMoney={seasonMoney} leagueId={leagueId} />}
            {tab === 'admin'   && isAdmin && <AdminTab tournament={tournament} standings={standings} weekMoney={weekMoney} picks={picks} liveData={liveData} leagueId={leagueId} inviteCode={inviteCode} leagueRules={leagueRules} roster={roster} onSetupTournament={handleSetupTournament} onFinalize={handleFinalize} onClearTournament={handleClearTournament} onClearPicks={handleClearPicks} onSwapGolfer={handleSwapGolfer} onSaveRules={handleSaveRules} onSaveInviteCode={handleSaveInviteCode} />}
          </div>
        )}
      </main>

      {/* ── Bottom tab bar — mobile only ── */}
      <nav className="bottom-tab-bar">
        {[
          { key: 'live',    icon: '⛳', label: 'Live' },
          { key: 'picks',   icon: '🏌️', label: 'Picks' },
          { key: 'draft',   icon: '📋', label: 'Draft' },
          { key: 'money',   icon: '💰', label: 'Money' },
          { key: 'history', icon: '📈', label: 'History' },
          { key: 'stats',   icon: '🏅', label: 'Stats' },
          { key: 'recap',   icon: '🏆', label: 'Recap' },
          ...(isAdmin ? [{ key: 'admin', icon: '⚙️', label: 'Admin' }] : []),
        ].map(item => (
          <button
            key={item.key}
            className={`bottom-tab-btn ${tab === item.key ? 'active' : ''}`}
            onClick={() => handleTabChange(item.key)}
          >
            <span className="bottom-tab-icon">{item.icon}</span>
            <span className="bottom-tab-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
