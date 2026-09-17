/**
 * QuoteFlow domain model.
 *
 * Money is represented everywhere as an integer number of minor units (cents).
 * Never store or pass around floating point currency — all arithmetic lives in
 * `src/lib/money.ts` and is deterministic application code, never AI output.
 */

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired'
export type QuoteSource = 'scan' | 'manual'
export type LineItemType = 'service' | 'material' | 'allowance' | 'other'
export type FollowUpStatus = 'pending' | 'done' | 'skipped'
export type ScanStatus = 'processing' | 'needs_review' | 'reviewed'

export const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired']
export const LINE_ITEM_TYPES: LineItemType[] = ['service', 'material', 'allowance', 'other']

/**
 * Tax is modelled as a named rate rather than a hardcoded "GST" boolean so a
 * different region's tax model can be swapped in without touching the schema.
 */
export interface BusinessProfile {
  id: string
  business_name: string
  logo_url: string | null
  /** Explicit setting — never inferred from the numbers a user types. */
  gst_inclusive: boolean
  /** Fractional rate, e.g. 0.15 for NZ GST. */
  gst_rate: number
  /** Display label for the tax line ("GST", "VAT", "Sales Tax", ...). */
  tax_label: string
  currency_code: string
  default_terms: string
  default_validity_days: number
  contact_email: string | null
  contact_phone: string | null
  address: string | null
  created_at: string
}

export interface Customer {
  id: string
  business_id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export interface Quote {
  id: string
  business_id: string
  customer_id: string | null
  /** Null until the quote is accepted; acceptance creates the job. */
  job_id: string | null
  quote_number: string
  status: QuoteStatus
  site_address: string | null
  scope_summary: string | null
  /** Snapshotted from the business profile when the quote is created. */
  gst_inclusive: boolean
  gst_rate: number
  /** Minor units. Computed by `recalculateQuote`, never entered by hand. */
  subtotal: number
  gst_amount: number
  total: number
  valid_until: string | null
  terms: string | null
  source: QuoteSource
  /** Database-generated opaque token used by the real customer-facing link. */
  public_token?: string | null
  created_at: string
  sent_at: string | null
  decided_at: string | null
}

export interface QuoteItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit: string
  /** Minor units, optional — contractors don't always track cost. */
  cost: number | null
  /** Percentage, e.g. 25 for a 25% markup. Optional. */
  markup: number | null
  /** Minor units, per unit. This is the number that drives the totals. */
  selling_price: number
  type: LineItemType
  notes: string | null
  sort_order: number
}

export interface PriceBookItem {
  id: string
  business_id: string
  name: string
  type: LineItemType
  unit: string
  cost: number | null
  markup: number | null
  selling_price: number
}

export interface FollowUp {
  id: string
  quote_id: string
  scheduled_for: string
  status: FollowUpStatus
  draft_message: string | null
  sent_manually_at: string | null
}

export interface Job {
  id: string
  business_id: string
  customer_id: string | null
  quote_id: string
  site_address: string | null
  scope_summary: string | null
  created_at: string
}

export interface NoteScan {
  id: string
  quote_id: string | null
  image_urls: string[]
  raw_extraction_json: ExtractionResult | null
  status: ScanStatus
  created_at: string
}

/* ------------------------------------------------------------------ */
/* AI extraction shapes                                                */
/* ------------------------------------------------------------------ */

/** Normalised 0..1 box within the source image: [x, y, width, height]. */
export type BoundingBox = [number, number, number, number]

/**
 * Every value the extractor returns is wrapped so the Review screen can show a
 * confidence indicator and the exact photo crop the value was read from.
 */
export interface ExtractedField<T> {
  value: T | null
  /** 0..1. Anything below NEEDS_REVIEW_THRESHOLD is surfaced for review. */
  confidence: number
  source_image_index: number | null
  source_bbox: BoundingBox | null
}

export interface ExtractedLineItem {
  description: ExtractedField<string>
  quantity: ExtractedField<number>
  unit: ExtractedField<string>
  /**
   * A *guess* at a price read off the page, in minor units. It is never used in
   * a total until a human confirms it on the Review screen.
   */
  price_guess: ExtractedField<number>
  type: ExtractedField<LineItemType>
}

export interface ExtractionResult {
  customer: {
    name: ExtractedField<string>
    phone: ExtractedField<string>
    email: ExtractedField<string>
    address: ExtractedField<string>
  }
  site: {
    address: ExtractedField<string>
  }
  scope: ExtractedField<string>
  line_items: ExtractedLineItem[]
  notes: ExtractedField<string>
  /** Free-text explanation of anything the model could not read. */
  unreadable_notes: string[]
  model: string
  extracted_at: string
}

/** Below this, a field is flagged "needs review" rather than silently trusted. */
export const NEEDS_REVIEW_THRESHOLD = 0.75
