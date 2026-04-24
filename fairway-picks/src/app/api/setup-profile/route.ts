import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const FOUNDING_LEAGUE_ID = '00000000-0000-0000-0000-000000000001'

export async function POST(request: NextRequest) {
  const { display_name, claimed_name } = await request.json()

  if (!display_name) {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 })
  }

  const authHeader = request.headers.get('Authorization')
  const accessToken = authHeader?.replace('Bearer ', '')
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Verify the caller's identity using the anon client
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Use the service role key for DB writes — bypasses RLS safely from server-side code.
  // Identity is already verified above; service role is appropriate here.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // is_admin is a super-admin flag, not a per-league commissioner flag.
  // Only the legacy founding-league admins (Eric, Chase) get it on signup;
  // commissioner rights for custom leagues are tracked via leagues.commissioner_id.
  const isLegacyAdmin = !!claimed_name && ['Eric', 'Chase'].includes(claimed_name)

  // Upsert profile — works whether or not the row already exists
  const { error: profileErr } = await db.from('profiles').upsert({
    id: user.id,
    display_name,
    email: user.email ?? '',
    is_admin: isLegacyAdmin,
  }, { onConflict: 'id' })

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // If claiming a legacy player name, record alias, auto-join the founding
  // league, AND link the founding league's roster placeholder to this user.
  // Without the last step, the person would be a league_member but no pick /
  // result would resolve to them because the roster entry (e.g. "Max") is
  // still a placeholder (user_id NULL).
  if (claimed_name) {
    await db.from('player_aliases').upsert({
      user_id: user.id,
      player_name: claimed_name,
    }, { onConflict: 'user_id' })

    await db.from('league_members').upsert({
      league_id: FOUNDING_LEAGUE_ID,
      user_id: user.id,
    }, { onConflict: 'league_id,user_id' })

    // Adopt the placeholder row on the founding roster. We match strictly on
    // user_id IS NULL so we never reassign a row that already belongs to a
    // different user.
    await db.from('league_roster')
      .update({ user_id: user.id, added_by: user.id })
      .eq('league_id', FOUNDING_LEAGUE_ID)
      .eq('player_name', claimed_name)
      .is('user_id', null)
  }

  return NextResponse.json({ success: true })
}
