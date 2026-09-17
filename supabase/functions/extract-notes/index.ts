/**
 * Note extraction edge function.
 *
 * Reads photos of handwritten site notes and returns the structured
 * `ExtractionOutcome` the app's `NoteExtractor` interface expects. The model
 * call lives here so the API key never reaches a phone browser.
 *
 * Two rules this function exists to enforce:
 *  1. The model interprets handwriting. It never invents a value and never
 *     calculates one — prices come back as `price_guess` and stay out of every
 *     total until a human confirms them.
 *  2. Partial extraction is a success. Unreadable input comes back as a
 *     low-confidence or null field, never an error that loses the photos.
 *
 * Deploy: supabase functions deploy extract-notes
 * Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 */

import Anthropic from 'npm:@anthropic-ai/sdk@^0.126.0'
import { EXTRACTION_SCHEMA } from './schema.ts'

const MODEL = 'claude-opus-5'

const SYSTEM_PROMPT = `You read photographs of handwritten site notes taken by tradespeople — electricians, plumbers, builders — and turn them into structured data for a quoting app.

What matters:

- Report what is on the page. Never invent a customer, a line item, a quantity or a price that is not written there. If something is not on the page, its value is null.
- Never do arithmetic. You do not total anything, you do not apply tax, you do not convert "2.5 days" into an hourly rate or a dollar figure. The app computes every number a customer sees; you only read.
- A price is only a price if it is written down. "allow $400 gib repair" is a price. "labour 2.5d @ ?? /hr" is not — that is a null price with low confidence.
- Partial results are good results. A page you can only half read is worth far more than a failure. Return what you can and describe the rest in unreadable_notes.
- Be honest about confidence. Below 0.75 sends a field to the contractor for review, which is exactly where anything smudged, ambiguous, crossed out or inferred belongs. Do not inflate confidence to look useful.
- Bounding boxes must tightly enclose the handwriting you actually read, as fractions of the page ([x, y, width, height], each 0 to 1, origin at the top left). The contractor taps a field and sees that crop, so a loose or wrong box is worse than none. Use the index of the page the words appear on.
- Notes often run across pages — a scope list on page 1 and its prices on page 2. Match them up, and set each field's source_image_index to the page that field came from.
- Tidy the wording into something a customer could read ("6 x LED downlights kitchen" -> "LED downlights — kitchen"), but never change the substance.`

interface ExtractionImage {
  url: string
  base64?: string
  mimeType?: string
}

interface ExtractionInput {
  images: ExtractionImage[]
  hints?: { knownItemNames?: string[]; knownCustomerNames?: string[] }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** An empty result, so a failure still leaves the contractor something to edit. */
function emptyResult(model: string) {
  const blank = () => ({ value: null, confidence: 0, source_image_index: null, source_bbox: null })
  return {
    customer: { name: blank(), phone: blank(), email: blank(), address: blank() },
    site: { address: blank() },
    scope: blank(),
    line_items: [],
    notes: blank(),
    unreadable_notes: [],
    model,
    extracted_at: new Date().toISOString(),
  }
}

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS },
  })
}

/**
 * A failure here is still a 200 with an empty result and a warning. The app
 * treats extraction as best-effort; an error status would drop the contractor
 * back to zero after they have already taken the photos.
 */
function degraded(warning: string): Response {
  return respond({ result: emptyResult(MODEL), warning })
}

const SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number]

function mediaTypeFor(image: ExtractionImage): SupportedMediaType {
  const declared = image.mimeType === 'image/jpg' ? 'image/jpeg' : image.mimeType
  return SUPPORTED_MEDIA_TYPES.includes(declared as SupportedMediaType)
    ? (declared as SupportedMediaType)
    : 'image/jpeg'
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return respond({ error: 'Use POST.' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return degraded(
      'Note reading is not configured on this server yet. Fill the quote in by hand for now.',
    )
  }

  let input: ExtractionInput
  try {
    input = await request.json()
  } catch {
    return respond({ error: 'Body must be JSON.' }, 400)
  }

  // Only photos that actually carry bytes can be read; an object URL created in
  // the browser means nothing on this side.
  const pages = (input.images ?? []).filter((image) => Boolean(image.base64))
  if (pages.length === 0) {
    return degraded('No readable photos were uploaded, so there was nothing to read.')
  }

  const hints = [
    input.hints?.knownCustomerNames?.length
      ? `Existing customers, in case one of these is who the notes refer to: ${input.hints.knownCustomerNames.join(', ')}.`
      : null,
    input.hints?.knownItemNames?.length
      ? `This contractor's usual price book wording, to match against where the notes are abbreviated: ${input.hints.knownItemNames.join('; ')}.`
      : null,
  ].filter(Boolean)

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // Handwriting is genuinely hard to read; let the model work at it.
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: [
            ...pages.map((image, index) => [
              { type: 'text' as const, text: `Page ${index + 1} of ${pages.length}:` },
              {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: mediaTypeFor(image),
                  data: image.base64!,
                },
              },
            ]).flat(),
            {
              type: 'text' as const,
              text: [
                `Read these ${pages.length} page(s) of site notes and return the structured extraction.`,
                ...hints,
              ].join('\n\n'),
            },
          ],
        },
      ],
    })

    // Safety classifiers can decline; that is not an app error, but there is
    // nothing to show either.
    if (response.stop_reason === 'refusal') {
      return degraded(
        "These photos couldn't be processed automatically. Your pages are saved — fill in what you need and carry on.",
      )
    }

    const text = response.content.find((block) => block.type === 'text')
    if (!text || text.type !== 'text') {
      return degraded('Nothing could be read from those pages. Add the details by hand below.')
    }

    const parsed = JSON.parse(text.text)
    return respond({
      result: { ...parsed, model: MODEL, extracted_at: new Date().toISOString() },
      warning:
        parsed.unreadable_notes?.length > 0
          ? 'Some of the handwriting could not be read — check the flagged fields.'
          : undefined,
    })
  } catch (error) {
    // Distinguish what the caller can act on from what they can't, but never
    // fail the request: the photos are already taken.
    if (error instanceof Anthropic.RateLimitError) {
      return degraded('Note reading is busy right now. Try again shortly, or fill it in by hand.')
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('extract-notes: ANTHROPIC_API_KEY is invalid.')
      return degraded('Note reading is not configured correctly on this server.')
    }
    console.error('extract-notes failed:', error)
    return degraded(
      "The notes couldn't be read automatically. Your photos are saved — fill in what you need and carry on.",
    )
  }
})
