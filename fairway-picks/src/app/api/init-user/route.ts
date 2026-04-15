import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Returns profile + league membership for the given user_id.
// Uses service role key so RLS is bypassed.
// No auth check — data is non-sensitive (display name, league info).
//
// Optional: pass preferred_league_id to return a specific league membership
// (e.g. after creating or joining a new league). Falls back to oldest if the
// user has no membership for the preferred league.
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('user_id')
  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  const preferredLeagueId = request.nextUrl.searchParams.get('preferred_league_id')

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const memberSelect = 'league_id, leagues(name, rules, commissioner_id)'

  const [{ data: profile }, { data: preferredMembership }] = await Promise.all([
    db.from('profiles').select('display_name, is_admin').eq('id', userId).maybeSingle(),
    preferredLeagueId
      ? db.from('league_members')
          .select(memberSelect)
          .eq('user_id', userId)
          .eq('league_id', preferredLeagueId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Use the preferred league if the user has a membership there; otherwise
  // fall back to the oldest membership (original behaviour).
  let membership = preferredMembership
  if (!membership) {
    const { data: oldest } = await db
      .from('league_members')
      .select(memberSelect)
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    membership = oldest
  }

  return NextResponse.json({ profile, membership })
}
