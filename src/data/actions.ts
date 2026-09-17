/**
 * Business rules that sit above the persistence layer, so the demo and
 * Supabase backends behave identically.
 *
 * The lifecycle rule that matters most (spec §2): a Job is not created
 * upfront. Site, customer and scope live on the Quote. Accepting a quote is
 * what creates the Job, snapshotting those details at that moment. Declined
 * and expired quotes never create one.
 */

import type {
  BusinessProfile, Customer, FollowUp, Job, Quote, QuoteItem, QuoteStatus,
} from '@/types/domain'
import { isoDaysFromNow, nowIso, isPast } from '@/lib/dates'
import { newId, normaliseName, normalisePhone } from '@/lib/utils'
import { calculateTotals } from '@/lib/money'
import { nextQuoteNumber } from '@/lib/quote-number'
import { buildFollowUpSchedule } from '@/lib/follow-ups'

export function createDraftQuote(
  business: BusinessProfile,
  existingQuotes: ReadonlyArray<Quote>,
  overrides: Partial<Quote> = {},
): Quote {
  return {
    id: newId(),
    business_id: business.id,
    customer_id: null,
    job_id: null,
    quote_number: nextQuoteNumber(existingQuotes),
    status: 'draft',
    site_address: null,
    scope_summary: null,
    // Each quote snapshots the business tax setting so changing the default
    // later never silently rewrites the numbers on a quote already sent.
    gst_inclusive: business.gst_inclusive,
    gst_rate: business.gst_rate,
    subtotal: 0,
    gst_amount: 0,
    total: 0,
    valid_until: isoDaysFromNow(business.default_validity_days),
    terms: business.default_terms,
    source: 'manual',
    created_at: nowIso(),
    sent_at: null,
    decided_at: null,
    ...overrides,
  }
}

export function blankQuoteItem(quoteId: string, sortOrder: number): QuoteItem {
  return {
    id: newId(),
    quote_id: quoteId,
    description: '',
    quantity: 1,
    unit: 'each',
    cost: null,
    markup: null,
    selling_price: 0,
    type: 'service',
    notes: null,
    sort_order: sortOrder,
  }
}

/** Renumber after a reorder or delete so `sort_order` stays dense. */
export function resequence(items: QuoteItem[]): QuoteItem[] {
  return items.map((item, index) => ({ ...item, sort_order: index }))
}

export function withRecalculatedTotals(quote: Quote, items: ReadonlyArray<QuoteItem>): Quote {
  return { ...quote, ...calculateTotals(items, quote.gst_inclusive, quote.gst_rate) }
}

/* ------------------------------------------------------------------ */
/* Status transitions                                                  */
/* ------------------------------------------------------------------ */

export interface SendResult {
  quote: Quote
  followUps: FollowUp[]
}

export function sendQuote(quote: Quote, customerName: string, validityDays: number): SendResult {
  const sent: Quote = {
    ...quote,
    status: 'sent',
    sent_at: nowIso(),
    valid_until: quote.valid_until ?? isoDaysFromNow(validityDays),
  }
  return { quote: sent, followUps: buildFollowUpSchedule(sent, customerName) }
}

export interface AcceptResult {
  quote: Quote
  job: Job
}

/** Acceptance is the only thing that creates a Job. */
export function acceptQuote(quote: Quote): AcceptResult {
  const job: Job = {
    id: newId(),
    business_id: quote.business_id,
    customer_id: quote.customer_id,
    quote_id: quote.id,
    // Snapshot — later edits to the quote don't rewrite the job.
    site_address: quote.site_address,
    scope_summary: quote.scope_summary,
    created_at: nowIso(),
  }
  return {
    quote: { ...quote, status: 'accepted', decided_at: nowIso(), job_id: job.id },
    job,
  }
}

export function declineQuote(quote: Quote): Quote {
  return { ...quote, status: 'declined', decided_at: nowIso() }
}

export function expireQuote(quote: Quote): Quote {
  return { ...quote, status: 'expired' }
}

/** A settled quote needs no more chasing. */
export function cancelPendingFollowUps(followUps: ReadonlyArray<FollowUp>): FollowUp[] {
  return followUps
    .filter((f) => f.status === 'pending')
    .map((f) => ({ ...f, status: 'skipped' as const }))
}

/** Quotes past their validity date that nobody has responded to. */
export function findLapsedQuotes(quotes: ReadonlyArray<Quote>): Quote[] {
  return quotes.filter((q) => q.status === 'sent' && isPast(q.valid_until))
}

/**
 * "Can you do it cheaper?" — the most common real follow-up. Copies the quote
 * and its lines into a fresh draft, leaving the original untouched.
 */
export function duplicateQuote(
  quote: Quote,
  items: ReadonlyArray<QuoteItem>,
  existingQuotes: ReadonlyArray<Quote>,
  validityDays: number,
): { quote: Quote; items: QuoteItem[] } {
  const id = newId()
  const copiedItems = items
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item, index) => ({ ...item, id: newId(), quote_id: id, sort_order: index }))

  const draft: Quote = {
    ...quote,
    id,
    quote_number: nextQuoteNumber(existingQuotes),
    status: 'draft',
    job_id: null,
    valid_until: isoDaysFromNow(validityDays),
    source: quote.source,
    created_at: nowIso(),
    sent_at: null,
    decided_at: null,
    ...calculateTotals(copiedItems, quote.gst_inclusive, quote.gst_rate),
  }

  return { quote: draft, items: copiedItems }
}

/* ------------------------------------------------------------------ */
/* Customer de-duplication                                             */
/* ------------------------------------------------------------------ */

export interface CustomerMatch {
  customer: Customer
  reason: 'phone' | 'name'
}

/**
 * Before a scan inserts a customer, look for one that's probably the same
 * person. The UI asks "is this an existing customer?" rather than silently
 * creating a duplicate.
 */
export function findCustomerMatch(
  candidates: ReadonlyArray<Customer>,
  name: string | null,
  phone: string | null,
): CustomerMatch | null {
  const phoneKey = normalisePhone(phone)
  if (phoneKey) {
    const byPhone = candidates.find((c) => normalisePhone(c.phone) === phoneKey)
    if (byPhone) return { customer: byPhone, reason: 'phone' }
  }

  const nameKey = normaliseName(name ?? '')
  if (nameKey.length >= 4) {
    const byName = candidates.find((c) => {
      const key = normaliseName(c.name)
      return key === nameKey || key.includes(nameKey) || nameKey.includes(key)
    })
    if (byName) return { customer: byName, reason: 'name' }
  }

  return null
}

/* ------------------------------------------------------------------ */
/* Dashboard stats                                                     */
/* ------------------------------------------------------------------ */

export interface QuoteStats {
  byStatus: Record<QuoteStatus, number>
  /** Quotes that have ever been sent, however they ended up. */
  sentCount: number
  acceptedCount: number
  /** Whole-percent win rate, or null when nothing has been sent yet. */
  winRate: number | null
  /** Total value of quotes awaiting a response, in minor units. */
  awaitingValue: number
  acceptedValue: number
}

export function computeStats(quotes: ReadonlyArray<Quote>): QuoteStats {
  const byStatus: Record<QuoteStatus, number> = {
    draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0,
  }
  for (const quote of quotes) byStatus[quote.status] += 1

  // Anything past draft was sent at some point, so it counts in the win rate.
  const sentCount = byStatus.sent + byStatus.accepted + byStatus.declined + byStatus.expired
  const acceptedCount = byStatus.accepted

  return {
    byStatus,
    sentCount,
    acceptedCount,
    winRate: sentCount === 0 ? null : Math.round((acceptedCount / sentCount) * 100),
    awaitingValue: quotes.filter((q) => q.status === 'sent').reduce((sum, q) => sum + q.total, 0),
    acceptedValue: quotes.filter((q) => q.status === 'accepted').reduce((sum, q) => sum + q.total, 0),
  }
}
