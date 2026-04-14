import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Returns profile + league membership for the given user_id.
// Uses service role key so RLS is bypassed.
// No auth check — data is non-sensitive (display name, league info).
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('user_id')
  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [{ data: profile }, { data: membership }] = await Promise.all([
    db.from('profiles').select('display_name, is_admin').eq('id', userId).maybeSingle(),
    db.from('league_members')
      .select('league_id, leagues(name, rules)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
  ])

  return NextResponse.json({ profile, membership })
}
