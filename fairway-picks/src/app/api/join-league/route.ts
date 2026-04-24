import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// POST /api/join-league { invite_code } (or { league_id })
// Atomically adds the authenticated caller to a league:
//   1. Upserts league_members
//   2. Links them into league_roster:
//        * If a placeholder row (user_id IS NULL) exists with the same
//          player_name as their display_name, link that row to this user.
//        * Else if no row exists for this display_name, insert a new one.
//        * Else if a row exists owned by a different user → 409 collision.
//
// Service role bypasses RLS so this can atomically adopt placeholders,
// which the anon client cannot do (UPDATE on league_roster is restricted
// to the commissioner).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const inviteCode: string | undefined = body.invite_code
  const leagueIdParam: string | undefined = body.league_id

  if (!inviteCode && !leagueIdParam) {
    return NextResponse.json({ error: 'invite_code or league_id required' }, { status: 400 })
  }

  const authHeader = request.headers.get('Authorization')
  const accessToken = authHeader?.replace('Bearer ', '')
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(accessToken)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Resolve the target league
  let leagueId = leagueIdParam
  if (!leagueId && inviteCode) {
    const { data: league } = await db
      .from('leagues')
      .select('id')
      .eq('invite_code', inviteCode.toUpperCase())
      .maybeSingle()
    if (!league) {
      return NextResponse.json({ error: 'League not found' }, { status: 404 })
    }
    leagueId = league.id
  }

  if (!leagueId) {
    return NextResponse.json({ error: 'Unable to resolve league' }, { status: 404 })
  }

  // Fetch profile for display_name — the name we'll use on the roster
  const { data: profile } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.display_name) {
    return NextResponse.json(
      { error: 'Profile not set up — finish signup before joining a league' },
      { status: 409 }
    )
  }

  const displayName: string = profile.display_name

  // 1) Membership — idempotent
  const { error: memberErr } = await db
    .from('league_members')
    .upsert(
      { league_id: leagueId, user_id: user.id },
      { onConflict: 'league_id,user_id' }
    )
  if (memberErr) {
    return NextResponse.json({ error: 'Membership insert failed: ' + memberErr.message }, { status: 500 })
  }

  // 2) Roster — three cases:
  //    (a) existing placeholder with same player_name → adopt it
  //    (b) row already owned by THIS user → no-op (idempotent join)
  //    (c) nothing for this name → insert
  //    (d) row owned by a DIFFERENT user → 409 collision
  const { data: existing } = await db
    .from('league_roster')
    .select('id, user_id')
    .eq('league_id', leagueId)
    .eq('player_name', displayName)
    .maybeSingle()

  if (existing) {
    if (existing.user_id === null) {
      // (a) Adopt the placeholder
      const { error: adoptErr } = await db
        .from('league_roster')
        .update({ user_id: user.id, added_by: user.id })
        .eq('id', existing.id)
      if (adoptErr) {
        return NextResponse.json(
          { error: 'Roster adopt failed: ' + adoptErr.message },
          { status: 500 }
        )
      }
    } else if (existing.user_id !== user.id) {
      // (d) Someone else already owns this name in this league
      return NextResponse.json(
        {
          error: 'name_taken',
          message: `The name "${displayName}" is already in use in this league. Change your display name or ask the commissioner to add you manually with a different name.`,
        },
        { status: 409 }
      )
    }
    // (b) existing.user_id === user.id → no-op, already on the roster
  } else {
    // (c) Fresh insert
    const { error: insertErr } = await db
      .from('league_roster')
      .insert({
        league_id: leagueId,
        player_name: displayName,
        user_id: user.id,
        added_by: user.id,
      })
    if (insertErr) {
      // If another request won the race and inserted between our check + insert,
      // retry the adopt path once.
      if (insertErr.code === '23505') {
        const { data: raced } = await db
          .from('league_roster')
          .select('id, user_id')
          .eq('league_id', leagueId)
          .eq('player_name', displayName)
          .maybeSingle()
        if (raced?.user_id === null) {
          await db
            .from('league_roster')
            .update({ user_id: user.id, added_by: user.id })
            .eq('id', raced.id)
        } else if (raced?.user_id && raced.user_id !== user.id) {
          return NextResponse.json(
            { error: 'name_taken', message: `The name "${displayName}" is already in use in this league.` },
            { status: 409 }
          )
        }
      } else {
        return NextResponse.json(
          { error: 'Roster insert failed: ' + insertErr.message },
          { status: 500 }
        )
      }
    }
  }

  return NextResponse.json({ success: true, league_id: leagueId, player_name: displayName })
}
