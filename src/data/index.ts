import type { Repository } from './repository'
import { DemoRepository } from './demo/demo-repository'
import { supabaseConfigured } from './supabase/config'

const forced = import.meta.env.VITE_DATA_BACKEND

/**
 * Demo data is the default so the app is usable the moment it loads; a real
 * Supabase project takes over as soon as its credentials are present.
 *
 * The Supabase adapter is imported dynamically: it pulls in the whole
 * supabase-js client, and there is no reason to make a contractor on a job
 * site download that when they aren't using it.
 */
export async function createRepository(): Promise<Repository> {
  if (forced !== 'demo' && (forced === 'supabase' || supabaseConfigured)) {
    const { SupabaseRepository } = await import('./supabase/supabase-repository')
    return new SupabaseRepository()
  }
  return new DemoRepository()
}

export type { Repository, Snapshot, PublicQuoteView } from './repository'
