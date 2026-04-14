import { createClient as supabaseCreateClient } from '@supabase/supabase-js'

// Browser client — uses localStorage for session storage (implicit flow).
// @supabase/ssr's createBrowserClient was causing all REST requests to hang
// in production; the regular supabase-js client works reliably.
export function createClient() {
  return supabaseCreateClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    }
  )
}
