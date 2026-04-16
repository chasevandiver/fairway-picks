'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import App from '@/app/page'

// Public/shareable league URL. Behaviour:
//   • Unauthenticated → render the full app in guest (read-only) mode right here,
//     so the URL stays at /league/<id> and the page can be bookmarked / added to
//     the iPhone home screen without losing context on refresh.
//   • Authenticated member → store league preference and go to the main app.
//   • Authenticated non-member → send to the join flow.

export default function LeaguePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const [status, setStatus] = useState<'loading' | 'guest'>('loading')

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // No session — show the public guest view at this URL
        setStatus('guest')
        return
      }

      // Verify league membership
      const { data: member } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('league_id', params.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!member) {
        router.push(`/join/${params.id}`)
        return
      }

      // Member confirmed — open the main app scoped to this league
      localStorage.setItem('activeLeagueId', params.id)
      router.push('/')
    }
    check()
  }, [params.id])

  if (status === 'loading') {
    return (
      <div className="loading-screen">
        <div className="spin" style={{ fontSize: 32 }}>⛳</div>
        Loading league…
      </div>
    )
  }

  // Render the full app in guest mode — URL stays at /league/<id>
  return <App guestLeagueId={params.id} />
}
