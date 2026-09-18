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

/** Tax is modelled as a named rate rather than a hardcoded "GST" boolean. */
export interface BusinessProfile {
  id: string
  business_name: string
  logo_url: string | null
  gst_inclusive: boolean
  gst_rate: number
  tax_label: string
  currency_code: string
  default_terms: string
  default_validity_days: number
  /** Default markup applied to material cost when a cost is entered. */
  default_material_markup: number
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
  job_id: string | null
  quote_number: string
  status: QuoteStatus
  site_address: string | null
  scope_summary: string | null
  gst_inclusive: boolean
  gst_rate: number
  subtotal: number
  gst_amount: number
  total: number
  valid_until: string | null
  terms: string | null
  source: QuoteSource
  public_token?: string | null
  created_at: string
  sent_at: string | null
  decided_at: string | null
}

export interface QuoteRevision {
  id: string
  quote_id: string
  business_id: string
  revision_number: number
  customer_id: string | null
  site_address: string | null
  scope_summary: string | null
  gst_inclusive: boolean
  gst_rate: number
  subtotal: number
  gst_amount: number
  total: number
  valid_until: string | null
  terms: string | null
  source: QuoteSource
  public_token: string | null
  status: QuoteStatus
  created_by: string | null
  created_at: string
  sent_at: string | null
  decided_at: string | null
}

export interface QuoteRevisionItem {
  id: string
  revision_id: string
  description: string
  quantity: number
  unit: string
  cost: number | null
  markup: number | null
  selling_price: number
  type: LineItemType
  notes: string | null
  sort_order: number
}

export interface QuoteItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit: string
  cost: number | null
  markup: number | null
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

export type BoundingBox = [number, number, number, number]
export interface ExtractedField<T> {
  value: T | null
  confidence: number
  source_image_index: number | null
  source_bbox: BoundingBox | null
}
export interface ExtractedLineItem {
  description: ExtractedField<string>
  quantity: ExtractedField<number>
  unit: ExtractedField<string>
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
  site: { address: ExtractedField<string> }
  scope: ExtractedField<string>
  line_items: ExtractedLineItem[]
  notes: ExtractedField<string>
  unreadable_notes: string[]
  model: string
  extracted_at: string
}
export const NEEDS_REVIEW_THRESHOLD = 0.75
