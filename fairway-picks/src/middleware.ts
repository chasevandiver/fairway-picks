import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// With implicit-flow auth (localStorage sessions), the server can't read
// the session — so we can't do server-side route protection here.
// Auth is enforced client-side: unauthenticated users see the LandingPage
// at / and are redirected to /auth from the client when needed.
export async function middleware(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|apple-touch-icon\\.png).*)'],
}
