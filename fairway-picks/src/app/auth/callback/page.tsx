'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// This page handles the redirect back from Supabase after a magic link click.
//
// Two flows:
// 1. Implicit flow — Supabase appends #access_token=...&refresh_token=... to the URL.
//    We read the hash directly (server-side code never sees hashes) and call setSession()
//    to store the session in localStorage.
//
// 2. PKCE flow — Supabase appends ?code=... to the URL.
//    We call exchangeCodeForSession(code) which stores the session in localStorage.
//
// After storing the session we redirect to / where onAuthStateChange picks it up.
export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const hash = window.location.hash
    if (hash.includes('access_token')) {
      const params = new URLSearchParams(hash.slice(1)) // strip leading #
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token') ?? ''
      if (accessToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(() => {
          router.replace('/')
        })
        return
      }
    }

    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(() => {
        router.replace('/')
      })
      return
    }

    // Nothing to process — back to auth
    router.replace('/auth')
  }, [router])

  return (
    <div className="loading-screen">
      <div className="spin" style={{ fontSize: 32 }}>⛳</div>
      Signing you in…
    </div>
  )
}
