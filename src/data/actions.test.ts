import { describe, expect, it } from 'vitest'
import {
  acceptQuote, cancelPendingFollowUps, computeStats, createDraftQuote, declineQuote,
  duplicateQuote, findCustomerMatch, findLapsedQuotes, resequence, withRecalculatedTotals,
} from './actions'
import type { BusinessProfile, Customer, FollowUp, Quote, QuoteItem } from '@/types/domain'
import { isoDaysFromNow } from '@/lib/dates'

const business: BusinessProfile = {
  id: 'biz', business_name: 'Test Electrical', logo_url: null,
  gst_inclusive: false, gst_rate: 0.15, tax_label: 'GST', currency_code: 'NZD',
  default_terms: 'Terms', default_validity_days: 30,
  contact_email: null, contact_phone: null, address: null, created_at: '2026-01-01T00:00:00.000Z',
}

const item = (over: Partial<QuoteItem> = {}): QuoteItem => ({
  id: 'i1', quote_id: 'q1', description: 'Labour', quantity: 2, unit: 'hour',
  cost: null, markup: null, selling_price: 9000, type: 'service', notes: null, sort_order: 0,
  ...over,
})

const quote = (over: Partial<Quote> = {}): Quote => ({
  ...createDraftQuote(business, []), id: 'q1', ...over,
})

describe('createDraftQuote', () => {
  it('snapshots the business tax setting onto the quote', () => {
    const inclusive = createDraftQuote({ ...business, gst_inclusive: true, gst_rate: 0.2 }, [])
    expect(inclusive.gst_inclusive).toBe(true)
    expect(inclusive.gst_rate).toBe(0.2)
  })

  it('starts as a draft with no job attached', () => {
    const draft = createDraftQuote(business, [])
    expect(draft.status).toBe('draft')
    expect(draft.job_id).toBeNull()
  })

  it('allocates the next sequential quote number', () => {
    const year = new Date().getFullYear()
    const draft = createDraftQuote(business, [
      { quote_number: `Q-${year}-0007` } as Quote,
      { quote_number: `Q-${year}-0041` } as Quote,
    ])
    expect(draft.quote_number).toBe(`Q-${year}-0042`)
  })
})

describe('quote lifecycle', () => {
  it('creates a job only on acceptance, snapshotting site and scope', () => {
    const sent = quote({ status: 'sent', site_address: '14 Rimu Grove', scope_summary: 'Rewire' })
    const { quote: accepted, job } = acceptQuote(sent)

    expect(accepted.status).toBe('accepted')
    expect(accepted.job_id).toBe(job.id)
    expect(job.quote_id).toBe(sent.id)
    expect(job.site_address).toBe('14 Rimu Grove')
    expect(job.scope_summary).toBe('Rewire')
  })

  it('never creates a job when a quote is declined', () => {
    const declined = declineQuote(quote({ status: 'sent' }))
    expect(declined.status).toBe('declined')
    expect(declined.job_id).toBeNull()
    expect(declined.decided_at).not.toBeNull()
  })

  it('stops chasing a quote once it is settled', () => {
    const followUps: FollowUp[] = [
      { id: 'f1', quote_id: 'q1', scheduled_for: '2026-01-01', status: 'pending', draft_message: null, sent_manually_at: null },
      { id: 'f2', quote_id: 'q1', scheduled_for: '2025-01-01', status: 'done', draft_message: null, sent_manually_at: null },
    ]
    const cancelled = cancelPendingFollowUps(followUps)
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0]).toMatchObject({ id: 'f1', status: 'skipped' })
  })

  it('only lapses quotes that are still awaiting a response', () => {
    const lapsed = findLapsedQuotes([
      quote({ id: 'a', status: 'sent', valid_until: isoDaysFromNow(-1) }),
      quote({ id: 'b', status: 'sent', valid_until: isoDaysFromNow(5) }),
      quote({ id: 'c', status: 'accepted', valid_until: isoDaysFromNow(-9) }),
      quote({ id: 'd', status: 'draft', valid_until: isoDaysFromNow(-9) }),
    ])
    expect(lapsed.map((q) => q.id)).toEqual(['a'])
  })
})

describe('duplicate as new draft', () => {
  const original = quote({ status: 'accepted', job_id: 'job_1', sent_at: '2026-01-01T00:00:00.000Z', decided_at: '2026-01-05T00:00:00.000Z' })
  const items = [item({ id: 'i1', sort_order: 0 }), item({ id: 'i2', sort_order: 1, selling_price: 5000 })]

  it('produces a clean draft with fresh ids', () => {
    const copy = duplicateQuote(original, items, [original], 30)
    expect(copy.quote.status).toBe('draft')
    expect(copy.quote.id).not.toBe(original.id)
    expect(copy.quote.job_id).toBeNull()
    expect(copy.quote.sent_at).toBeNull()
    expect(copy.quote.decided_at).toBeNull()
    expect(copy.items.map((i) => i.id)).not.toContain('i1')
    expect(copy.items.every((i) => i.quote_id === copy.quote.id)).toBe(true)
  })

  it('carries the totals across', () => {
    const copy = duplicateQuote(original, items, [original], 30)
    expect(copy.quote.subtotal).toBe(2 * 9000 + 2 * 5000)
  })

  it('leaves the original untouched', () => {
    duplicateQuote(original, items, [original], 30)
    expect(original.status).toBe('accepted')
    expect(original.job_id).toBe('job_1')
  })
})

describe('customer de-duplication', () => {
  const existing: Customer[] = [
    { id: 'c1', business_id: 'biz', name: 'Marcus Whiting', phone: '021 447 8892', email: null, address: null, notes: null, created_at: '' },
    { id: 'c2', business_id: 'biz', name: 'Kōwhai Bakery Ltd', phone: null, email: null, address: null, notes: null, created_at: '' },
  ]

  it('matches on phone number regardless of formatting', () => {
    const match = findCustomerMatch(existing, 'M. Whiting', '+64 21 447 8892')
    expect(match?.customer.id).toBe('c1')
    expect(match?.reason).toBe('phone')
  })

  it('matches on name when the phone is missing', () => {
    expect(findCustomerMatch(existing, 'Kowhai Bakery', null)?.customer.id).toBe('c2')
  })

  it('does not match a genuinely new customer', () => {
    expect(findCustomerMatch(existing, 'Gemma Clarke', '022 401 7789')).toBeNull()
  })

  it('ignores phone fragments too short to be meaningful', () => {
    expect(findCustomerMatch(existing, 'Zz', '8892')).toBeNull()
  })
})

describe('totals stay in sync with the line items', () => {
  it('recalculates from the items, ignoring whatever was stored', () => {
    const stale = quote({ subtotal: 999_999, gst_amount: 999_999, total: 999_999 })
    const fresh = withRecalculatedTotals(stale, [item({ quantity: 1, selling_price: 10000 })])
    expect(fresh).toMatchObject({ subtotal: 10000, gst_amount: 1500, total: 11500 })
  })

  it('keeps sort_order dense after a delete', () => {
    const resequenced = resequence([item({ id: 'a', sort_order: 0 }), item({ id: 'b', sort_order: 7 })])
    expect(resequenced.map((i) => i.sort_order)).toEqual([0, 1])
  })
})

describe('dashboard stats', () => {
  const quotes = [
    quote({ id: '1', status: 'draft' }),
    quote({ id: '2', status: 'sent', total: 10000 }),
    quote({ id: '3', status: 'accepted', total: 50000 }),
    quote({ id: '4', status: 'declined' }),
    quote({ id: '5', status: 'expired' }),
  ]

  it('counts everything past draft as sent when computing the win rate', () => {
    const stats = computeStats(quotes)
    expect(stats.sentCount).toBe(4)
    expect(stats.acceptedCount).toBe(1)
    expect(stats.winRate).toBe(25)
  })

  it('has no win rate before anything has been sent', () => {
    expect(computeStats([quote({ status: 'draft' })]).winRate).toBeNull()
  })

  it('totals the value awaiting a response separately from wins', () => {
    const stats = computeStats(quotes)
    expect(stats.awaitingValue).toBe(10000)
    expect(stats.acceptedValue).toBe(50000)
  })
})
