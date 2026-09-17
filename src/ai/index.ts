import type { NoteExtractor } from './extraction'
import { MockExtractor } from './mock-extractor'
import { supabaseConfigured } from '@/data/supabase/config'

let extractor: NoteExtractor | null = null

/**
 * The one place the extraction backend is chosen. Everything else in the app
 * depends only on the `NoteExtractor` interface.
 *
 * The edge-function extractor is code-split because it pulls in the Supabase
 * client; on the demo backend it is never fetched.
 */
export async function getExtractor(): Promise<NoteExtractor> {
  if (!extractor) {
    if (supabaseConfigured) {
      const { EdgeExtractor } = await import('./edge-extractor')
      extractor = new EdgeExtractor()
    } else {
      extractor = new MockExtractor()
    }
  }
  return extractor
}

export type {
  ExtractionImage,
  ExtractionInput,
  ExtractionOutcome,
  NoteExtractor,
} from './extraction'
export { emptyExtraction } from './extraction'
