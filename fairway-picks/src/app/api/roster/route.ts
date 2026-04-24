import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// /api/roster — commissioner-only CRUD for league_roster.
//
// Supported operations:
//   POST   { league_id, player_name }
//     Add a placeholder roster entry (user_id = NULL). Used for friends who
//     aren't signing up for accounts, or to pre-seed names before people join.
//
//   PATCH  { id, player_name?, user_id? }
//     * player_name: rename the entry. Blocked if any picks/results/
//       golfer_results already reference the current name (MVP: no automatic
//       cascade — the commissioner should remove+re-add only if nothing has
//       been played under that name yet).
//     * user_id: link a placeholder to a user (or reassign an owner). Also
//       upserts a league_members row for that user so they can actually
//       access the league in the app.
//
//   DELETE { id }
//     Remove a roster entry. Blocked if any picks/results/golfer_results
//     still reference the name (keeps historical data intact).
//
// All operations require the caller to be the commissioner of the target
// league. Service role key used so the route can cross-table writes without
// relying on multiple overlapping RLS policies.

async function authAndCommissioner(request: NextRequest, leagueId: string) {
  const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!accessToken) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: authError } = await anonClient.auth.getUser(accessToken)
  if (authError || !user) return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: league } = await db
    .from('leagues')
    .select('id, commissioner_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (!league) return { error: NextResponse.json({ error: 'League not found' }, { status: 404 }) }
  if (league.commissioner_id !== user.id) {
    return { error: NextResponse.json({ error: 'Only the commissioner can manage the roster' }, { status: 403 }) }
  }

  return { user, db, league }
}

// Checks whether any picks/results/golfer_results reference a given name
// within a league. Used to block renames/removals that would orphan picks.
async function rosterNameInUse(
  db: ReturnType<typeof createClient>,
  leagueId: string,
  playerName: string,
): Promise<{ used: boolean; where?: string }> {
  // Tournament ids for the league (filtering by league keeps this scoped)
  const { data: tournaments } = await db
    .from('tournaments')
    .select('id')
    .eq('league_id', leagueId)
  const ids = (tournaments ?? []).map((t: any) => t.id)
  if (ids.length === 0) return { used: false }

  const { count: pickCount } = await db
    .from('picks')
    .select('id', { count: 'exact', head: true })
    .in('tournament_id', ids)
    .eq('player_name', playerName)
  if ((pickCount ?? 0) > 0) return { used: true, where: 'picks' }

  const { count: resultCount } = await db
    .from('results')
    .select('id', { count: 'exact', head: true })
    .in('tournament_id', ids)
    .eq('player_name', playerName)
  if ((resultCount ?? 0) > 0) return { used: true, where: 'results' }

  const { count: grCount } = await db
    .from('golfer_results')
    .select('id', { count: 'exact', head: true })
    .in('tournament_id', ids)
    .eq('player_name', playerName)
  if ((grCount ?? 0) > 0) return { used: true, where: 'golfer_results' }

  return { used: false }
}

// ── POST: add placeholder ────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const leagueId: string | undefined = body.league_id
  const playerName: string | undefined = body.player_name?.trim()

  if (!leagueId) return NextResponse.json({ error: 'league_id required' }, { status: 400 })
  if (!playerName) return NextResponse.json({ error: 'player_name required' }, { status: 400 })
  if (playerName.length > 40) return NextResponse.json({ error: 'player_name too long' }, { status: 400 })

  const auth = await authAndCommissioner(request, leagueId)
  if ('error' in auth) return auth.error
  const { user, db } = auth

  const { data, error } = await db
    .from('league_roster')
    .insert({ league_id: leagueId, player_name: playerName, user_id: null, added_by: user.id })
    .select('id, player_name, user_id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'name_taken', message: `"${playerName}" already exists in this league.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ entry: data })
}

// ── PATCH: rename or link to a user ──────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id: string | undefined = body.id
  const newName: string | undefined = body.player_name?.trim()
  const newUserId: string | null | undefined = body.user_id // null = unlink, string = link, undefined = skip

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Look up the roster row first (need league_id for auth)
  const db0 = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: row } = await db0
    .from('league_roster')
    .select('id, league_id, player_name, user_id')
    .eq('id', id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Roster entry not found' }, { status: 404 })

  const auth = await authAndCommissioner(request, row.league_id)
  if ('error' in auth) return auth.error
  const { db } = auth

  const patch: { player_name?: string; user_id?: string | null } = {}

  if (typeof newName === 'string' && newName !== row.player_name) {
    if (newName.length > 40) return NextResponse.json({ error: 'player_name too long' }, { status: 400 })
    // Block rename if the current name is already in picks/results
    const used = await rosterNameInUse(db, row.league_id, row.player_name)
    if (used.used) {
      return NextResponse.json(
        { error: 'name_in_use', message: `Can't rename — "${row.player_name}" already has entries in ${used.where}. Remove them first or keep the name.` },
        { status: 409 }
      )
    }
    patch.player_name = newName
  }

  if (newUserId !== undefined && newUserId !== row.user_id) {
    if (newUserId) {
      // Confirm the user has a profile
      const { data: profile } = await db.from('profiles').select('id').eq('id', newUserId).maybeSingle()
      if (!profile) return NextResponse.json({ error: 'user not found' }, { status: 404 })
      // Ensure they're not already linked to another roster row in this league
      const { data: existing } = await db
        .from('league_roster')
        .select('id')
        .eq('league_id', row.league_id)
        .eq('user_id', newUserId)
        .neq('id', row.id)
        .maybeSingle()
      if (existing) {
        return NextResponse.json(
          { error: 'user_linked_elsewhere', message: 'That user already has a roster entry in this league.' },
          { status: 409 }
        )
      }
      // Also ensure they're a league member
      await db.from('league_members')
        .upsert({ league_id: row.league_id, user_id: newUserId }, { onConflict: 'league_id,user_id' })
    }
    patch.user_id = newUserId
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ entry: row })
  }

  const { data: updated, error } = await db
    .from('league_roster')
    .update(patch)
    .eq('id', id)
    .select('id, player_name, user_id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'name_taken', message: `That name already exists in this league.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ entry: updated })
}

// ── DELETE: remove a roster entry ────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const id: string | undefined = body.id
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db0 = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: row } = await db0
    .from('league_roster')
    .select('id, league_id, player_name')
    .eq('id', id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Roster entry not found' }, { status: 404 })

  const auth = await authAndCommissioner(request, row.league_id)
  if ('error' in auth) return auth.error
  const { db } = auth

  const used = await rosterNameInUse(db, row.league_id, row.player_name)
  if (used.used) {
    return NextResponse.json(
      { error: 'name_in_use', message: `Can't remove — "${row.player_name}" has entries in ${used.where}. Delete those first if you really want to remove them.` },
      { status: 409 }
    )
  }

  const { error } = await db.from('league_roster').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
