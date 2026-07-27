import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getUserFromRequest, serviceClient } from '@/lib/apiAuth'

// Always per-request: reads query params and hits the database.
export const dynamic = 'force-dynamic'

// Returns all league data needed by the app (history, season money, active
// tournament). Accepts league_id (UUID) or invite_code.
//
// Authorization model:
//   * Authenticated members get the full payload, including the invite code.
//   * Everyone else gets the payload only when leagues.is_public_view = true,
//     with the invite code redacted (guest/spectator mode).
//   * Private leagues return 404 to non-members — indistinguishable from a
//     league that doesn't exist, so league ids/codes can't be probed.
export async function GET(request: NextRequest) {
  const db = serviceClient()

  let leagueId = request.nextUrl.searchParams.get('league_id') ?? ''
  const inviteCodeParam = request.nextUrl.searchParams.get('invite_code')

  if (inviteCodeParam && !leagueId) {
    const { data: league } = await db
      .from('leagues')
      .select('id')
      .eq('invite_code', inviteCodeParam.toUpperCase())
      .maybeSingle()
    if (!league) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 })
    }
    leagueId = league.id
  }

  // No silent fallback to the founding league — callers must scope the request.
  if (!leagueId) {
    return NextResponse.json(
      { error: 'league_id or invite_code required' },
      { status: 400 }
    )
  }

  const { data: leagueRow } = await db
    .from('leagues')
    .select('invite_code, name, rules, is_public_view, commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (!leagueRow) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 })
  }

  // ── Authorization ──────────────────────────────────────────────────────────
  const user = await getUserFromRequest(request)
  let isMember = false
  if (user) {
    const { data: membership } = await db
      .from('league_members')
      .select('id')
      .eq('league_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    isMember = !!membership
  }

  if (!isMember && !leagueRow.is_public_view) {
    // Same status as an unknown league so private leagues can't be enumerated.
    return NextResponse.json({ error: 'League not found' }, { status: 404 })
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  const [
    { data: tournaments },
    { data: activeTournament },
    { data: memberRows },
  ] = await Promise.all([
    db.from('tournaments').select('id').eq('league_id', leagueId).in('status', ['completed', 'finalized']),
    db.from('tournaments').select('*').eq('league_id', leagueId).eq('status', 'active').maybeSingle(),
    db.from('league_members')
      .select('user_id, joined_at, profiles(display_name, player_aliases(player_name))')
      .eq('league_id', leagueId),
  ])

  const tournamentIds = (tournaments ?? []).map((t: any) => t.id)

  let results: any[] = []
  let golferResults: any[] = []
  let picks: any[] = []
  let historyPicks: any[] = []

  if (tournamentIds.length > 0) {
    const [{ data: r }, { data: gr }, { data: hp }] = await Promise.all([
      db.from('results')
        .select('*, tournaments(name, date, is_major)')
        .in('tournament_id', tournamentIds)
        .order('created_at', { ascending: false }),
      db.from('golfer_results')
        .select('*, tournaments(name, date, is_major)')
        .in('tournament_id', tournamentIds)
        .order('created_at', { ascending: false }),
      // Draft order for finished events. golfer_results records what a golfer
      // did but not which round they were taken in, so draft-position stats
      // need the picks rows too. Narrow select — this is the widest table.
      db.from('picks')
        .select('tournament_id, player_name, golfer_name, pick_order')
        .in('tournament_id', tournamentIds),
    ])
    results = r ?? []
    golferResults = gr ?? []
    historyPicks = hp ?? []
  }

  if (activeTournament) {
    const { data: p } = await db
      .from('picks')
      .select('*')
      .eq('tournament_id', activeTournament.id)
      .order('pick_order')
    picks = p ?? []
  }

  // Season money is DERIVED from results (single source of truth) rather than
  // read from the legacy season_money running-total table — the running total
  // could drift and, pre-fix, was even overwritten across leagues.
  const moneyTotals: Record<string, number> = {}
  for (const r of results) {
    moneyTotals[r.player_name] = (moneyTotals[r.player_name] || 0) + (r.money_won || 0)
  }
  const seasonMoney = Object.entries(moneyTotals)
    .map(([player_name, total]) => ({ player_name, total }))
    .sort((a, b) => b.total - a.total)

  const members = (memberRows ?? []).map((m: any) => ({
    user_id: m.user_id,
    joined_at: m.joined_at,
    display_name: m.profiles?.display_name ?? '',
    player_name: m.profiles?.player_aliases?.[0]?.player_name ?? null,
  }))

  return NextResponse.json({
    activeTournament,
    seasonMoney,
    results,
    golferResults,
    picks,
    historyPicks,
    tournamentIds,
    members,
    // Invite codes are for members only — a public-view guest must never see one.
    inviteCode: isMember ? leagueRow.invite_code : null,
    leagueName: leagueRow.name ?? '',
    leagueRules: leagueRow.rules ?? null,
    commissionerId: leagueRow.commissioner_id ?? null,
    isPublicView: leagueRow.is_public_view ?? false,
    isMember,
    leagueId,
  })
}
