import { createClient } from '@supabase/supabase-js'
import JoinClient from './client'

// Server component — fetches league data server-side so the page renders
// instantly with no client-side loading state. Only the Join button itself
// needs client-side auth (in client.tsx).
export default async function JoinPage({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase()

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: league } = await db
    .from('leagues')
    .select('id, name, invite_code, rules')
    .eq('invite_code', code)
    .maybeSingle()

  if (league) {
    const { count } = await db
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id)
    return <JoinClient code={code} league={{ ...league, memberCount: count ?? 0 }} />
  }

  return <JoinClient code={code} league={null} />
}
