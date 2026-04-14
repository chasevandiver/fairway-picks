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

  // First verify the token is valid and get the user identity
  const verifyClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await verifyClient.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Create a client that sends the user's JWT on every request so RLS
  // sees auth.uid() = user.id. Using global headers is more reliable than
  // setSession() which requires a valid refresh_token.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    }
  )

  // Upsert profile — handles both first-time setup and re-submission
  // (a profile row may already exist if the user retried the flow)
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: user.id,
    display_name,
    email: user.email ?? '',
    is_admin: ADMIN_NAMES.includes(display_name),
  }, { onConflict: 'id' })

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // If claiming a legacy player name, record alias and auto-join founding league.
  // Use upsert/ignore-on-conflict so re-submissions don't fail.
  if (claimed_name) {
    const { error: aliasErr } = await supabase.from('player_aliases').upsert({
      user_id: user.id,
      player_name: claimed_name,
    }, { onConflict: 'player_name' })
    if (aliasErr) {
      return NextResponse.json({ error: aliasErr.message }, { status: 500 })
    }

    // league_members has UNIQUE(league_id, user_id) — ignore if already a member
    await supabase.from('league_members').upsert({
      league_id: FOUNDING_LEAGUE_ID,
      user_id: user.id,
    }, { onConflict: 'league_id,user_id', ignoreDuplicates: true })
  }

  return NextResponse.json({ success: true })
}
