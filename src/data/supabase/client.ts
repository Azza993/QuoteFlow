import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './config'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or run on the demo backend.',
    )
  }
  client ??= createClient(supabaseUrl!, supabaseAnonKey!)
  return client
}

export { supabaseConfigured }
