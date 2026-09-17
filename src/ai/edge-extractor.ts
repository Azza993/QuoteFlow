/**
 * Real extraction, via a Supabase Edge Function.
 *
 * The model call lives server-side so the API key is never shipped to a phone
 * browser. The function is expected to return an `ExtractionOutcome`; see
 * `supabase/functions/extract-notes/index.ts`.
 */

import type { ExtractionInput, ExtractionOutcome, NoteExtractor } from './extraction'
import { emptyExtraction } from './extraction'
import { getSupabase } from '@/data/supabase/client'

export class EdgeExtractor implements NoteExtractor {
  readonly name = 'supabase-edge/extract-notes'

  async extract(input: ExtractionInput): Promise<ExtractionOutcome> {
    const { data, error } = await getSupabase().functions.invoke<ExtractionOutcome>(
      'extract-notes',
      { body: input },
    )

    // Partial extraction is always acceptable, and a failed call must never
    // dump the contractor back to zero — they keep their photos and can fill
    // the quote in by hand from the Review screen.
    if (error || !data?.result) {
      return {
        result: emptyExtraction(this.name),
        warning:
          'The notes could not be read automatically. Your photos are saved — fill in what you need below and carry on.',
      }
    }

    return data
  }
}
