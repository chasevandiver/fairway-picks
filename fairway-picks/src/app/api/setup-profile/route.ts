import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const FOUNDING_LEAGUE_ID = '00000000-0000-0000-0000-000000000001'
const ADMIN_NAMES = ['Eric', 'Chase']

export async function POST(request: NextRequest) {
  const { display_name, claimed_name } = await request.json()

  if (!display_name) {
    return NextResponse.json({ error: 'display_name is required' }, { status: 400 })
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as any)
          )
        },
      },
    }
  )

  // Verify the user's session server-side
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Insert profile — runs with user's auth context so RLS passes
  const { error: profileErr } = await supabase.from('profiles').insert({
    id: user.id,
    display_name,
    email: user.email ?? '',
    is_admin: ADMIN_NAMES.includes(display_name),
  })

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // If claiming a legacy player name, record the alias and auto-join founding league
  if (claimed_name) {
    await supabase.from('player_aliases').insert({
      user_id: user.id,
      player_name: claimed_name,
    })
    await supabase.from('league_members').insert({
      league_id: FOUNDING_LEAGUE_ID,
      user_id: user.id,
    })
  }

  return NextResponse.json({ success: true })
}
