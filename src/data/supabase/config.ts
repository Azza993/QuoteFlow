/**
 * Supabase configuration, deliberately kept in its own module.
 *
 * Everything that only needs to *know whether* Supabase is configured imports
 * from here. Importing `client.ts` instead would pull the whole supabase-js
 * bundle into the main chunk, even for contractors on the demo backend.
 */

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
