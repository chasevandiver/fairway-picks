import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getUserFromRequest, serviceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// Returns the calling user's profile + a league membership. The user is
// derived from the Authorization: Bearer token — never from a query param —
// so one user can never read another's profile or memberships.
//
// Optional: pass preferred_league_id to return that membership (e.g. after
// creating or joining a league). Falls back to the oldest membership.
export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const preferredLeagueId = request.nextUrl.searchParams.get('preferred_league_id')
  const db = serviceClient()

  const memberSelect = 'league_id, leagues(name, rules, commissioner_id)'

  const [{ data: profile }, { data: preferredMembership }] = await Promise.all([
    db.from('profiles').select('display_name, is_admin').eq('id', user.id).maybeSingle(),
    preferredLeagueId
      ? db.from('league_members')
          .select(memberSelect)
          .eq('user_id', user.id)
          .eq('league_id', preferredLeagueId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  let membership = preferredMembership
  if (!membership) {
    const { data: oldest } = await db
      .from('league_members')
      .select(memberSelect)
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    membership = oldest
  }

  return NextResponse.json({ profile, membership })
}
