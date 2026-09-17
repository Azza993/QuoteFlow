/**
 * JSON Schema for the extraction result.
 *
 * This is handed to the Messages API as a structured output format, so the
 * model's response is guaranteed to match the `ExtractionResult` type the app
 * already understands (src/types/domain.ts) — no defensive parsing needed.
 */

/** Wraps a value with the confidence + source-crop metadata every field carries. */
function field(valueSchema: Record<string, unknown>, description: string) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'confidence', 'source_image_index', 'source_bbox'],
    properties: {
      value: { ...valueSchema, description },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description:
          'How sure you are of this reading. Below 0.75 flags it for human review, which is the correct outcome for anything smudged, ambiguous or inferred.',
      },
      source_image_index: {
        type: ['integer', 'null'],
        description: '0-based index of the page this was read from, or null if not on any page.',
      },
      source_bbox: {
        type: ['array', 'null'],
        minItems: 4,
        maxItems: 4,
        items: { type: 'number', minimum: 0, maximum: 1 },
        description:
          'Normalised [x, y, width, height] of the handwriting this value came from, as fractions of the page. Used to show the contractor the exact crop, so it must tightly bound the words you read.',
      },
    },
  }
}

const nullableString = { type: ['string', 'null'] as const }
const nullableNumber = { type: ['number', 'null'] as const }

export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['customer', 'site', 'scope', 'line_items', 'notes', 'unreadable_notes'],
  properties: {
    customer: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'phone', 'email', 'address'],
      properties: {
        name: field(nullableString, "The customer's name as written."),
        phone: field(nullableString, 'Phone number, digits as written.'),
        email: field(nullableString, 'Email address.'),
        address: field(nullableString, "The customer's address."),
      },
    },
    site: {
      type: 'object',
      additionalProperties: false,
      required: ['address'],
      properties: {
        address: field(nullableString, 'Where the work happens, if different from the customer.'),
      },
    },
    scope: field(nullableString, 'One or two plain sentences describing the job.'),
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'unit', 'price_guess', 'type'],
        properties: {
          description: field(nullableString, 'What the line is for.'),
          quantity: field(nullableNumber, 'How many. Default to 1 when the notes imply a single item.'),
          unit: field(nullableString, 'each, hour, day, m, lm, point, lot — whichever fits.'),
          price_guess: field(
            nullableNumber,
            'A price WRITTEN ON THE PAGE, in cents (e.g. $85.00 -> 8500). Null if no price appears for this line. Never estimate, calculate or infer a price — a missing price must come back null with low confidence.',
          ),
          type: field(
            { type: ['string', 'null'], enum: ['service', 'material', 'allowance', 'other', null] },
            'service, material, allowance, or other.',
          ),
        },
      },
    },
    notes: field(nullableString, 'Anything else worth keeping: access, timing, constraints.'),
    unreadable_notes: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Plain-English notes about anything on the page you could not read, so the contractor knows what to go back and check.',
    },
  },
} as const
