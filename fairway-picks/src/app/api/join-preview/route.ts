import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Returns league info by invite_code, plus member count and membership check.
// Uses service role so there are no browser → Supabase REST call hangs.
export async function GET(request: NextRequest) {
  const inviteCode = request.nextUrl.searchParams.get('invite_code')
  const userId = request.nextUrl.searchParams.get('user_id')

  if (!inviteCode) {
    return NextResponse.json({ error: 'invite_code required' }, { status: 400 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: league } = await db
    .from('leagues')
    .select('id, name, invite_code, rules')
    .eq('invite_code', inviteCode)
    .maybeSingle()

  if (!league) {
    return NextResponse.json({ league: null })
  }

  const [{ count }, { data: membership }] = await Promise.all([
    db.from('league_members').select('*', { count: 'exact', head: true }).eq('league_id', league.id),
    userId
      ? db.from('league_members').select('league_id').eq('league_id', league.id).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return NextResponse.json({
    league: { ...league, memberCount: count ?? 0 },
    alreadyMember: !!membership,
  })
}
