/**
 * Demo backend: the seeded dataset held in memory and mirrored to
 * localStorage so a contractor trying the app keeps their edits across
 * refreshes. Used whenever Supabase credentials are absent.
 */

import type { Repository, Snapshot, PublicQuoteView } from '../repository'
import { publicTokenFor } from '../repository'
import type {
  BusinessProfile, Customer, FollowUp, Job, NoteScan, PriceBookItem, Quote, QuoteItem, QuoteRevision, QuoteRevisionItem,
} from '@/types/domain'
import { nowIso } from '@/lib/dates'\nimport { newId } from '@/lib/utils'
import { buildSeedSnapshot } from './seed'

const STORAGE_KEY = 'quoteflow.demo.v1'

function upsertInto<T extends { id: string }>(list: T[], value: T): T[] {
  const index = list.findIndex((entry) => entry.id === value.id)
  if (index === -1) return [...list, value]
  const next = [...list]
  next[index] = value
  return next
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not store that photo.'))
    reader.readAsDataURL(file)
  })
}

export class DemoRepository implements Repository {
  readonly kind = 'demo' as const
  private snapshot: Snapshot

  constructor() {
    this.snapshot = this.readStored() ?? buildSeedSnapshot()
  }

  private readStored(): Snapshot | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Snapshot) : null
    } catch {
      return null
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot))
    } catch {
      /* Storage is a convenience here, never a correctness requirement. */
    }
  }

  private commit<T>(mutate: (snapshot: Snapshot) => T): Promise<T> {
    const result = mutate(this.snapshot)
    this.persist()
    return Promise.resolve(result)
  }

  loadSnapshot(): Promise<Snapshot> {
    return Promise.resolve(structuredClone(this.snapshot))
  }

  saveBusiness(business: BusinessProfile): Promise<BusinessProfile> {
    return this.commit((s) => {
      s.business = business
      return business
    })
  }

  upsertCustomer(customer: Customer): Promise<Customer> {
    return this.commit((s) => {
      s.customers = upsertInto(s.customers, customer)
      return customer
    })
  }

  deleteCustomer(id: string): Promise<void> {
    return this.commit((s) => {
      s.customers = s.customers.filter((c) => c.id !== id)
      s.quotes = s.quotes.map((q) => (q.customer_id === id ? { ...q, customer_id: null } : q))
    })
  }

  upsertQuote(quote: Quote): Promise<Quote> {
    return this.commit((s) => {
      s.quotes = upsertInto(s.quotes, quote)
      return quote
    })
  }

  deleteQuote(id: string): Promise<void> {
    return this.commit((s) => {
      const quote = s.quotes.find((q) => q.id === id)
      if (quote?.status === 'accepted') {
        throw new Error('Accepted quotes cannot be deleted; archive them instead.')
      }
      s.quotes = s.quotes.filter((q) => q.id !== id)
      s.quoteItems = s.quoteItems.filter((i) => i.quote_id !== id)
      s.followUps = s.followUps.filter((f) => f.quote_id !== id)
      s.noteScans = s.noteScans.filter((n) => n.quote_id !== id)
    })
  }

  replaceQuoteItems(quoteId: string, items: QuoteItem[]): Promise<QuoteItem[]> {
    return this.commit((s) => {
      s.quoteItems = [...s.quoteItems.filter((i) => i.quote_id !== quoteId), ...items]
      return items
    })
  }

  createQuoteRevision(quote: Quote, items: QuoteItem[]): Promise<{ revision: QuoteRevision; items: QuoteRevisionItem[] }> {
    return this.commit((s) => {
      const revisionNumber = Math.max(0, ...s.revisions.filter((r) => r.quote_id === quote.id).map((r) => r.revision_number)) + 1
      const revision: QuoteRevision = {
        id: newId(), quote_id: quote.id, business_id: quote.business_id, revision_number: revisionNumber,
        customer_id: quote.customer_id, site_address: quote.site_address, scope_summary: quote.scope_summary,
        gst_inclusive: quote.gst_inclusive, gst_rate: quote.gst_rate, subtotal: quote.subtotal,
        gst_amount: quote.gst_amount, total: quote.total, valid_until: quote.valid_until, terms: quote.terms,
        source: quote.source, public_token: newId(), status: 'draft', created_by: null, created_at: nowIso(),
        sent_at: null, decided_at: null,
      }
      const revisionItems: QuoteRevisionItem[] = items.map((item, index) => ({
        id: newId(), revision_id: revision.id, description: item.description, quantity: item.quantity,
        unit: item.unit, cost: item.cost, markup: item.markup, selling_price: item.selling_price,
        type: item.type, notes: item.notes, sort_order: index,
      }))
      s.revisions.push(revision); s.revisionItems.push(...revisionItems)
      return { revision, items: revisionItems }
    })
  }

  sendQuoteRevision(revisionId: string): Promise<QuoteRevision> {
    return this.commit((s) => {
      const revision = s.revisions.find((r) => r.id === revisionId)
      if (!revision || revision.status !== 'draft') throw new Error('Only a pending revision can be sent.')
      const sent = { ...revision, status: 'sent' as const, sent_at: nowIso() }
      s.revisions = s.revisions.map((r) => r.id === revisionId ? sent : r)
      return sent
    })
  }

  upsertPriceBookItem(item: PriceBookItem): Promise<PriceBookItem> {
    return this.commit((s) => {
      s.priceBook = upsertInto(s.priceBook, item)
      return item
    })
  }

  deletePriceBookItem(id: string): Promise<void> {
    return this.commit((s) => {
      s.priceBook = s.priceBook.filter((p) => p.id !== id)
    })
  }

  upsertFollowUp(followUp: FollowUp): Promise<FollowUp> {
    return this.commit((s) => {
      s.followUps = upsertInto(s.followUps, followUp)
      return followUp
    })
  }

  replaceFollowUps(quoteId: string, followUps: FollowUp[]): Promise<FollowUp[]> {
    return this.commit((s) => {
      s.followUps = [...s.followUps.filter((f) => f.quote_id !== quoteId), ...followUps]
      return followUps
    })
  }

  upsertJob(job: Job): Promise<Job> {
    return this.commit((s) => {
      s.jobs = upsertInto(s.jobs, job)
      return job
    })
  }

  upsertNoteScan(scan: NoteScan): Promise<NoteScan> {
    return this.commit((s) => {
      s.noteScans = upsertInto(s.noteScans, scan)
      return scan
    })
  }

  async storeNoteImage(_scanId: string, file: File): Promise<string> {
    // The demo has no object storage, so use a data URI. This keeps the demo
    // genuinely persistent across refreshes rather than saving a dead blob URL.
    return fileToDataUrl(file)
  }

  decideQuote(quoteId: string, decision: 'accepted' | 'declined'): Promise<{ quote: Quote; job: Job | null; alreadyDecided?: boolean }> {
    return this.commit((s) => {
      const quote = s.quotes.find((q) => q.id === quoteId)
      if (!quote) throw new Error('Quote not found')
      if (quote.status === decision) return { quote: structuredClone(quote), job: s.jobs.find((j) => j.quote_id === quote.id) ?? null, alreadyDecided: true }
      if (quote.status !== 'sent') throw new Error('Quote is not awaiting a decision.')
      let job = s.jobs.find((j) => j.quote_id === quote.id) ?? null
      if (decision === 'accepted') {
        if (!job) {
          job = { id: newId(), business_id: quote.business_id, customer_id: quote.customer_id, quote_id: quote.id,
            site_address: quote.site_address, scope_summary: quote.scope_summary, created_at: nowIso() }
          s.jobs = upsertInto(s.jobs, job)
        }
      }
      const updated = { ...quote, status: decision, decided_at: nowIso(), job_id: job?.id ?? null }
      s.quotes = s.quotes.map((q) => q.id === quote.id ? updated : q)
      return { quote: structuredClone(updated), job: job ? structuredClone(job) : null }
    })
  }

  loadPublicQuote(token: string): Promise<PublicQuoteView | null> {
    const quote = this.snapshot.quotes.find((q) => publicTokenFor(q.id) === token)
    if (!quote || quote.status === 'draft') return Promise.resolve(null)

    return Promise.resolve({
      quote: structuredClone(quote),
      items: structuredClone(
        this.snapshot.quoteItems
          .filter((i) => i.quote_id === quote.id)
          .sort((a, b) => a.sort_order - b.sort_order),
      ),
      customer: structuredClone(
        this.snapshot.customers.find((c) => c.id === quote.customer_id) ?? null,
      ),
      business: structuredClone(this.snapshot.business),
    })
  }

  decidePublicQuote(token: string, decision: 'accepted' | 'declined'): Promise<void> {
    return this.commit((s) => {
      const quote = s.quotes.find((q) => publicTokenFor(q.id) === token)
      if (!quote || quote.status !== 'sent') return

      let jobId = quote.job_id
      if (decision === 'accepted') {
        const job: Job = {
          id: `job_${quote.id}`,
          business_id: quote.business_id,
          customer_id: quote.customer_id,
          quote_id: quote.id,
          site_address: quote.site_address,
          scope_summary: quote.scope_summary,
          created_at: nowIso(),
        }
        s.jobs = upsertInto(s.jobs, job)
        jobId = job.id
      }

      quote.status = decision
      quote.decided_at = nowIso()
      quote.job_id = jobId
      s.followUps = s.followUps.map((f) =>
        f.quote_id === quote.id && f.status === 'pending' ? { ...f, status: 'skipped' as const } : f,
      )
    })
  }

  resetDemoData(): Promise<Snapshot> {
    this.snapshot = buildSeedSnapshot()
    this.persist()
    return this.loadSnapshot()
  }
}
