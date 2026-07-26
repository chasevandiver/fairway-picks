import { createClient } from '@supabase/supabase-js'
import JoinClient from './client'

// Invite-link preview must reflect the current code and member count on every
// hit — never the build-time full-route cache.
export const dynamic = 'force-dynamic'

// Server component — resolves the invite code server-side (knowing the code is
// the credential here). Passes only id/name/memberCount to the client; never
// the code list or rules.
export default async function JoinPage({ params }: { params: { code: string } }) {
  const code = params.code.toUpperCase()

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: league } = await db
    .from('leagues')
    .select('id, name')
    .eq('invite_code', code)
    .maybeSingle()

  if (league) {
    const { count } = await db
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league.id)
    return <JoinClient code={code} league={{ id: league.id, name: league.name, memberCount: count ?? 0 }} />
  }

  return <JoinClient code={code} league={null} />
}
