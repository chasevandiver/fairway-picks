import { createClient, type User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

/**
 * Resolve the authenticated user from a request's Authorization: Bearer
 * header. Returns null when there is no token or the token is invalid —
 * routes decide whether that means 401 or a reduced public response.
 *
 * Verification goes through the anon client's auth.getUser(), which validates
 * the JWT against Supabase Auth (no service-role trust involved).
 */
export async function getUserFromRequest(request: NextRequest): Promise<User | null> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data, error } = await anon.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

/** Service-role client for server routes. Bypasses RLS — every caller must
 *  do its own authorization first. */
export function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
