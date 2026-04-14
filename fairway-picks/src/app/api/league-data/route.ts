import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Returns all league data needed by the app (history, season money, active tournament).
// Uses service role key so RLS is bypassed — auth is verified separately.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const accessToken = authHeader?.replace('Bearer ', '')
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Verify caller identity
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const leagueId = request.nextUrl.searchParams.get('league_id') ?? '00000000-0000-0000-0000-000000000001'

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch everything in parallel
  const [
    { data: tournaments },
    { data: seasonMoney },
    { data: activeTournament },
  ] = await Promise.all([
    db.from('tournaments').select('id').eq('league_id', leagueId).eq('status', 'completed'),
    db.from('season_money').select('*'),
    db.from('tournaments').select('*').eq('league_id', leagueId).eq('status', 'active').maybeSingle(),
  ])

  const tournamentIds = (tournaments ?? []).map((t: any) => t.id)

  let results: any[] = []
  let golferResults: any[] = []
  let picks: any[] = []

  if (tournamentIds.length > 0) {
    const [{ data: r }, { data: gr }] = await Promise.all([
      db.from('results')
        .select('*, tournaments(name, date, is_major)')
        .in('tournament_id', tournamentIds)
        .order('created_at', { ascending: false }),
      db.from('golfer_results')
        .select('*, tournaments(name, date, is_major)')
        .in('tournament_id', tournamentIds)
        .order('created_at', { ascending: false }),
    ])
    results = r ?? []
    golferResults = gr ?? []
  }

  if (activeTournament) {
    const { data: p } = await db
      .from('picks')
      .select('*')
      .eq('tournament_id', activeTournament.id)
      .order('pick_order')
    picks = p ?? []
  }

  return NextResponse.json({
    activeTournament,
    seasonMoney: seasonMoney ?? [],
    results,
    golferResults,
    picks,
    tournamentIds,
  })
}
