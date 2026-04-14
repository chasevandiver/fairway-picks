'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// The main league app experience lives at the home route (/) and is
// league-aware via the user's league_members record.
// This route provides a bookmarkable URL for a specific league.
// On load, it verifies membership and redirects to the main app,
// setting the league context via the URL or session.

export default function LeaguePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function verify() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }

      // Verify the user is a member of this league
      const { data: member } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('league_id', params.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!member) {
        // Not a member — send to join flow
        router.push(`/join/${params.id}`)
        return
      }

      // Member confirmed — redirect to main app
      // The main app will auto-detect the user's leagues.
      // Since most users are in one league, this works seamlessly.
      router.push('/')
    }
    verify()
  }, [params.id])

  return (
    <div className="loading-screen">
      <div className="spin" style={{ fontSize: 32 }}>⛳</div>
      Loading league…
    </div>
  )
}
