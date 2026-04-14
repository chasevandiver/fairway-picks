import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// With localStorage-based sessions (implicit flow via @supabase/supabase-js),
// server-side code exchange via @supabase/ssr would store the session in cookies
// which the browser client never reads. Instead, we pass the code back to the
// client via a redirect so the browser can call exchangeCodeForSession() itself
// and store the result in localStorage.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    // Redirect to the root with the code in the query string.
    // The client-side useEffect in page.tsx detects ?code= and calls
    // supabase.auth.exchangeCodeForSession(code), storing the session in localStorage.
    const url = new URL(next, origin)
    url.searchParams.set('code', code)
    return NextResponse.redirect(url.toString())
  }

  return NextResponse.redirect(`${origin}/auth?error=auth_failed`)
}
