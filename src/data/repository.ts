/**
 * Persistence boundary.
 *
 * The app talks to this interface only. Two implementations exist:
 *  - `demo`     — realistic seeded data held in localStorage (the default, so
 *                 the app is immediately usable with no setup).
 *  - `supabase` — the real backend, used when Supabase env vars are present.
 *
 * Business rules (status transitions, job creation on acceptance, follow-up
 * scheduling, totals) deliberately live *above* this layer in
 * `src/data/actions.ts` so both backends behave identically.
 */

import type {
  BusinessProfile,
  Customer,
  FollowUp,
  Job,
  NoteScan,
  PriceBookItem,
  Quote,
  QuoteItem, QuoteRevision, QuoteRevisionItem,
} from '@/types/domain'

export interface Snapshot {
  business: BusinessProfile
  customers: Customer[]
  quotes: Quote[]
  quoteItems: QuoteItem[]
  priceBook: PriceBookItem[]
  followUps: FollowUp[]
  jobs: Job[]
  noteScans: NoteScan[]
  revisions: QuoteRevision[]
  revisionItems: QuoteRevisionItem[]
}

/** What a customer sees behind a public quote link. */
export interface PublicQuoteView {
  quote: Quote
  items: QuoteItem[]
  customer: Customer | null
  business: BusinessProfile
}

export interface Repository {
  readonly kind: 'demo' | 'supabase'

  loadSnapshot(): Promise<Snapshot>

  saveBusiness(business: BusinessProfile): Promise<BusinessProfile>

  upsertCustomer(customer: Customer): Promise<Customer>
  deleteCustomer(id: string): Promise<void>

  upsertQuote(quote: Quote): Promise<Quote>
  sendQuote(quoteId: string): Promise<Quote>
  deleteQuote(id: string): Promise<void>
  /** Items are always written as a complete, ordered set for one quote. */
  replaceQuoteItems(quoteId: string, items: QuoteItem[]): Promise<QuoteItem[]>
  createQuoteRevision(quote: Quote, items: QuoteItem[]): Promise<{ revision: QuoteRevision; items: QuoteRevisionItem[] }>
  sendQuoteRevision(revisionId: string): Promise<QuoteRevision>

  upsertPriceBookItem(item: PriceBookItem): Promise<PriceBookItem>
  deletePriceBookItem(id: string): Promise<void>

  upsertFollowUp(followUp: FollowUp): Promise<FollowUp>
  replaceFollowUps(quoteId: string, followUps: FollowUp[]): Promise<FollowUp[]>

  upsertJob(job: Job): Promise<Job>

  upsertNoteScan(scan: NoteScan): Promise<NoteScan>
  /** Persist a note photo and return its durable storage path/data URI. */
  storeNoteImage(scanId: string, file: File): Promise<string>

  /** Public, token-addressed read used by the customer-facing quote view. */
  loadPublicQuote(token: string): Promise<PublicQuoteView | null>
  /** The only write a customer can make: accept or decline. */
  decideQuote(quoteId: string, decision: 'accepted' | 'declined'): Promise<{ quote: Quote; job: Job | null; alreadyDecided?: boolean }>
  decidePublicQuote(token: string, decision: 'accepted' | 'declined'): Promise<void>

  /** Restore the seeded demo data. Only meaningful for the demo backend. */
  resetDemoData?(): Promise<Snapshot>
}

/**
 * Demo-only fallback token. Real Supabase quotes carry a database-generated
 * opaque `public_token`; callers should prefer that value whenever present.
 */
export function publicTokenFor(quoteId: string): string {
  return quoteId.replace(/-/g, '').slice(0, 24)
}
