import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Returns all league data needed by the app (history, season money, active tournament).
// No auth check on reads — data is non-sensitive (6-person golf league).
// Uses service role key so RLS is bypassed entirely.
export async function GET(request: NextRequest) {
  const leagueId = request.nextUrl.searchParams.get('league_id') ?? '00000000-0000-0000-0000-000000000001'

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch everything in parallel — including invite_code so the client makes only one API call
  // For tournaments: include league_id match OR null (old tournaments before multi-league was added)
  const [
    { data: allTournaments },
    { data: seasonMoney },
    { data: leagueRow },
  ] = await Promise.all([
    db.from('tournaments').select('id, status').or(`league_id.eq.${leagueId},league_id.is.null`),
    db.from('season_money').select('*'),
    db.from('leagues').select('invite_code').eq('id', leagueId).maybeSingle(),
  ])

  const tournaments = allTournaments ?? []
  const tournamentIds = tournaments.map((t: any) => t.id)
  const activeId = (allTournaments ?? []).find((t: any) => t.status === 'active')?.id ?? null

  let activeTournament = null
  let results: any[] = []
  let golferResults: any[] = []
  let picks: any[] = []

  const fetchPromises: Promise<any>[] = []

  if (activeId) {
    fetchPromises.push(
      db.from('tournaments').select('*').eq('id', activeId).single().then(({ data }) => { activeTournament = data }),
      db.from('picks').select('*').eq('tournament_id', activeId).order('pick_order').then(({ data }) => { picks = data ?? [] })
    )
  }

  if (tournamentIds.length > 0) {
    fetchPromises.push(
      db.from('results')
        .select('*, tournaments(name, date, is_major)')
        .in('tournament_id', tournamentIds)
        .order('created_at', { ascending: false })
        .then(({ data }) => { results = data ?? [] }),
      db.from('golfer_results')
        .select('*, tournaments(name, date, is_major)')
        .in('tournament_id', tournamentIds)
        .order('created_at', { ascending: false })
        .then(({ data }) => { golferResults = data ?? [] })
    )
  }

  await Promise.all(fetchPromises)

  return NextResponse.json({
    activeTournament,
    seasonMoney: seasonMoney ?? [],
    results,
    golferResults,
    picks,
    tournamentIds,
    inviteCode: leagueRow?.invite_code ?? '',
  })
}
