/**
 * The note-extraction interface.
 *
 * This is the seam between the UI and whatever multimodal model is behind it.
 * Keep this signature stable: the Scan and Review screens depend on it, and
 * swapping the model behind it must not require touching them.
 *
 * Rules this interface exists to enforce (spec §6, principles #2 and #4):
 *  - The extractor interprets handwriting. It never invents a value and never
 *    calculates one. Prices it reads off the page are `price_guess` and stay
 *    out of every total until a human confirms them on the Review screen.
 *  - Partial extraction is always acceptable. Unreadable input comes back as a
 *    low-confidence or null field, never a hard failure that loses the user's
 *    photos.
 *  - Every field carries a confidence score and a reference back to the crop
 *    of the source photo it was read from.
 */

import type { ExtractionResult } from '@/types/domain'

export interface ExtractionInput {
  /** One or more photos of handwritten notes, in page order. */
  images: ExtractionImage[]
  /** Optional hints that improve matching — e.g. the business's price book. */
  hints?: {
    knownItemNames?: string[]
    knownCustomerNames?: string[]
  }
}

export interface ExtractionImage {
  /** Displayable URL — an object URL, data URL, or stored file URL. */
  url: string
  /** Base64 payload for backends that need to upload the bytes. */
  base64?: string
  mimeType?: string
}

export interface ExtractionOutcome {
  result: ExtractionResult
  /**
   * Set when extraction only partly succeeded. The UI shows this alongside the
   * fields that did come through — it never replaces them with an error page.
   */
  warning?: string
}

export interface NoteExtractor {
  readonly name: string
  extract(input: ExtractionInput): Promise<ExtractionOutcome>
}

/** Convenience: an empty result to build on when nothing could be read. */
export function emptyExtraction(model: string): ExtractionResult {
  const blank = <T>() => ({
    value: null as T | null,
    confidence: 0,
    source_image_index: null,
    source_bbox: null,
  })

  return {
    customer: { name: blank<string>(), phone: blank<string>(), email: blank<string>(), address: blank<string>() },
    site: { address: blank<string>() },
    scope: blank<string>(),
    line_items: [],
    notes: blank<string>(),
    unreadable_notes: [],
    model,
    extracted_at: new Date().toISOString(),
  }
}
