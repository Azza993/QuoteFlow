/**
 * Demo extractor.
 *
 * Returns the same shape a real multimodal call would, including realistic
 * low-confidence fields, so the Review screen can be exercised end to end
 * without a model. Swapped out by `createExtractor()` as soon as a real
 * backend is configured.
 */

import type { ExtractionInput, ExtractionOutcome, NoteExtractor } from './extraction'
import { demoExtraction } from '@/data/demo/seed'
import { emptyExtraction } from './extraction'
import type { ExtractionResult } from '@/types/domain'

const THINKING_TIME_MS = 2200

export class MockExtractor implements NoteExtractor {
  readonly name = 'demo-extractor'

  async extract(input: ExtractionInput): Promise<ExtractionOutcome> {
    await new Promise((resolve) => setTimeout(resolve, THINKING_TIME_MS))

    if (input.images.length === 0) {
      return {
        result: emptyExtraction(this.name),
        warning: 'No photos were supplied, so there was nothing to read.',
      }
    }

    // Re-point the demo extraction at whatever images were actually passed in,
    // so the crop traceability on the Review screen lines up with them.
    const pageCount = input.images.length
    const result: ExtractionResult = remapImageIndexes(
      structuredClone(demoExtraction),
      pageCount,
    )
    result.extracted_at = new Date().toISOString()
    result.model = this.name

    return {
      result,
      warning:
        pageCount === 1
          ? 'Only one page was supplied — any pricing written on a second page is missing.'
          : undefined,
    }
  }
}

/** Clamp every source_image_index into the range of images we were given. */
function remapImageIndexes(result: ExtractionResult, pageCount: number): ExtractionResult {
  const clamp = (index: number | null) =>
    index === null ? null : Math.min(index, pageCount - 1)

  const fix = <T>(field: { source_image_index: number | null } & T) => ({
    ...field,
    source_image_index: clamp(field.source_image_index),
  })

  return {
    ...result,
    customer: {
      name: fix(result.customer.name),
      phone: fix(result.customer.phone),
      email: fix(result.customer.email),
      address: fix(result.customer.address),
    },
    site: { address: fix(result.site.address) },
    scope: fix(result.scope),
    notes: fix(result.notes),
    line_items: result.line_items.map((item) => ({
      description: fix(item.description),
      quantity: fix(item.quantity),
      unit: fix(item.unit),
      price_guess: fix(item.price_guess),
      type: fix(item.type),
    })),
  }
}
