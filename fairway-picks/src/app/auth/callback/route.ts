import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// This route handles redirects from Supabase magic links.
// Two possible flows:
//
// 1. PKCE flow (?code= in query string): Pass code to the client page so the
//    browser can call exchangeCodeForSession() and store in localStorage.
//    (Server-side exchange via @supabase/ssr stores in cookies, not localStorage,
//    so the @supabase/supabase-js browser client never sees it.)
//
// 2. Implicit flow (#access_token= in hash): The hash is client-side only —
//    the server never sees it. We redirect to / and the browser carries the
//    fragment along. detectSessionInUrl:true in createClient() handles it.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const url = new URL(next, origin)
    url.searchParams.set('code', code)
    return NextResponse.redirect(url.toString())
  }

  // No code in query string — implicit flow with #access_token= in hash.
  // Browser will carry the fragment to the redirect target.
  return NextResponse.redirect(`${origin}/`)
}
