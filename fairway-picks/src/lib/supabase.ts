import { createClient as supabaseCreateClient, type SupabaseClient } from '@supabase/supabase-js'

// Browser client — uses localStorage for session storage (implicit flow).
// @supabase/ssr's createBrowserClient was causing all REST requests to hang
// in production; the regular supabase-js client works reliably.
//
// Singleton: multiple GoTrue clients sharing one storage key race each other
// on token refresh, which is a classic cause of surprise logouts. Every
// createClient() caller gets the same instance.
let client: SupabaseClient<any, 'public', any> | null = null

export function createClient() {
  if (client) return client
  client = supabaseCreateClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // NOTE: keep the default storageKey — changing it would orphan every
        // existing user's stored session and force a re-login.
      },
    }
  )
  return client
}
