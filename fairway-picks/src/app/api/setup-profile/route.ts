import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const FOUNDING_LEAGUE_ID = '00000000-0000-0000-0000-000000000001'
const ADMIN_NAMES = ['Eric', 'Chase']

export async function POST(request: NextRequest) {
  const { display_name, claimed_name } = await request.json()

  if (!display_name) {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 })
  }

  // Client sends its access token in the Authorization header
  const authHeader = request.headers.get('Authorization')
  const accessToken = authHeader?.replace('Bearer ', '')
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Use service-like pattern: verify the token then act on behalf of the user
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Verify the token and get the user
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Set the session so subsequent DB calls run as this user
  await supabase.auth.setSession({ access_token: accessToken, refresh_token: '' })

  // Upsert profile — safe to call multiple times (idempotent)
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: user.id,
    display_name,
    email: user.email ?? '',
    is_admin: ADMIN_NAMES.includes(display_name),
  }, { onConflict: 'id' })

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // If claiming a legacy player name, record alias and auto-join founding league
  if (claimed_name) {
    await supabase.from('player_aliases').upsert({
      user_id: user.id,
      player_name: claimed_name,
    }, { onConflict: 'user_id' })
    await supabase.from('league_members').upsert({
      league_id: FOUNDING_LEAGUE_ID,
      user_id: user.id,
    }, { onConflict: 'league_id,user_id' })
  }

  return NextResponse.json({ success: true })
}
