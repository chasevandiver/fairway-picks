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

  // Verify the token and get the user identity
  const verifyClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await verifyClient.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // Client with user's JWT in headers so RLS sees auth.uid() = user.id
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )

  // Upsert profile — works for both first-time and re-submissions
  const { error: profileErr } = await supabase.from('profiles').upsert({
    id: user.id,
    display_name,
    email: user.email ?? '',
    is_admin: ADMIN_NAMES.includes(display_name),
  }, { onConflict: 'id' })

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  if (claimed_name) {
    // Check if the alias already exists before inserting.
    // We avoid upsert here because player_aliases has no UPDATE policy.
    const { data: existingAlias } = await supabase
      .from('player_aliases')
      .select('user_id')
      .eq('player_name', claimed_name)
      .maybeSingle()

    if (!existingAlias) {
      // Not claimed yet — insert fresh
      const { error: aliasErr } = await supabase.from('player_aliases').insert({
        user_id: user.id,
        player_name: claimed_name,
      })
      if (aliasErr) {
        return NextResponse.json({ error: aliasErr.message }, { status: 500 })
      }
    } else if (existingAlias.user_id !== user.id) {
      // Claimed by someone else
      return NextResponse.json({ error: `${claimed_name} has already been claimed by another account` }, { status: 400 })
    }
    // existingAlias.user_id === user.id → already claimed by this user, nothing to do

    // Add to founding league if not already a member
    const { data: existingMember } = await supabase
      .from('league_members')
      .select('id')
      .eq('league_id', FOUNDING_LEAGUE_ID)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existingMember) {
      await supabase.from('league_members').insert({
        league_id: FOUNDING_LEAGUE_ID,
        user_id: user.id,
      })
    }
  }

  return NextResponse.json({ success: true })
}
