/**
 * Application data context.
 *
 * Loads one snapshot at start-up and keeps it in React state; every mutation
 * writes through the repository and updates that state, so the UI stays
 * instant on a phone with patchy signal.
 */

import {
  createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type {
  BusinessProfile, Customer, FollowUp, Job, NoteScan, PriceBookItem, Quote, QuoteItem, QuoteRevision, QuoteRevisionItem,
} from '@/types/domain'
import { createRepository } from '.'
import type { Repository, Snapshot } from './repository'
import {
  acceptQuote, cancelPendingFollowUps, computeStats, createDraftQuote,
  declineQuote, duplicateQuote as buildDuplicate, expireQuote, findLapsedQuotes,
  resequence, sendQuote, withRecalculatedTotals, type QuoteStats,
} from './actions'
import { nowIso } from '@/lib/dates'
import { newId } from '@/lib/utils'

const EMPTY: Snapshot = {
  revisions: [], revisionItems: [],\n  business: {
    id: '', business_name: '', logo_url: null, gst_inclusive: false, gst_rate: 0.15,
    tax_label: 'GST', currency_code: 'NZD', default_terms: '', default_validity_days: 30,
    contact_email: null, contact_phone: null, address: null, created_at: '',
  },
  customers: [], quotes: [], quoteItems: [], priceBook: [], followUps: [], jobs: [], noteScans: [],
}

export interface DataContextValue extends Snapshot {
  loading: boolean
  error: string | null
  backend: 'demo' | 'supabase' | null
  /** Null only while the backend is being selected at start-up. */
  repository: Repository | null

  /* Lookups */
  quoteById: (id: string | null | undefined) => Quote | undefined
  itemsForQuote: (quoteId: string) => QuoteItem[]
  customerById: (id: string | null | undefined) => Customer | undefined
  customerForQuote: (quote: Quote | undefined) => Customer | undefined
  followUpsForQuote: (quoteId: string) => FollowUp[]
  scanForQuote: (quoteId: string) => NoteScan | undefined
  jobForQuote: (quoteId: string) => Job | undefined

  /* Derived */
  dueFollowUps: Array<{ followUp: FollowUp; quote: Quote }>
  stats: QuoteStats

  /* Mutations */
  saveBusiness: (business: BusinessProfile) => Promise<void>
  saveCustomer: (customer: Customer) => Promise<Customer>
  createCustomer: (fields: Partial<Customer> & { name: string }) => Promise<Customer>
  removeCustomer: (id: string) => Promise<void>

  createQuote: (overrides?: Partial<Quote>) => Promise<Quote>
  saveQuote: (quote: Quote) => Promise<Quote>\n  saveQuoteRevision: (quote: Quote, items: QuoteItem[]) => Promise<QuoteRevision>
  saveQuoteItems: (quoteId: string, items: QuoteItem[]) => Promise<void>
  removeQuote: (id: string) => Promise<void>
  duplicateQuote: (quoteId: string) => Promise<Quote>

  markSent: (quoteId: string) => Promise<void>
  markAccepted: (quoteId: string) => Promise<void>
  markDeclined: (quoteId: string) => Promise<void>
  reopenQuote: (quoteId: string) => Promise<void>

  saveFollowUp: (followUp: FollowUp) => Promise<void>
  completeFollowUp: (followUpId: string) => Promise<void>
  skipFollowUp: (followUpId: string) => Promise<void>
  scheduleFollowUp: (quoteId: string, scheduledFor: string, draft?: string | null) => Promise<void>

  savePriceBookItem: (item: PriceBookItem) => Promise<PriceBookItem>
  removePriceBookItem: (id: string) => Promise<void>

  saveNoteScan: (scan: NoteScan) => Promise<NoteScan>

  refresh: () => Promise<void>
  resetDemoData: () => Promise<void>
}

export const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const repositoryRef = useRef<Repository | null>(null)
  const [repository, setRepository] = useState<Repository | null>(null)

  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /*
   * React state alone is not enough here. A single user action often runs
   * several mutations back to back (saving a quote then its line items, say),
   * and the later ones must see what the earlier ones did. React has not
   * re-rendered by then, so a closed-over `snapshot` would still be the old
   * one and the second write would clobber the first. Mutations therefore read
   * and write through this ref, which `commit` keeps in step with the state.
   */
  const snapshotRef = useRef<Snapshot>(EMPTY)

  const commit = useCallback((update: (current: Snapshot) => Snapshot): Snapshot => {
    const next = update(snapshotRef.current)
    snapshotRef.current = next
    setSnapshot(next)
    return next
  }, [])

  /**
   * The repository for a mutation. Every caller runs after `loading` clears,
   * so this only throws if something reaches the data layer before start-up
   * has finished.
   */
  const repo = useCallback((): Repository => {
    const current = repositoryRef.current
    if (!current) throw new Error('QuoteFlow is still starting up.')
    return current
  }, [])

  // Pick the backend once, then load. The Supabase adapter is code-split, so
  // this is an async step even though it usually resolves immediately.
  useEffect(() => {
    let cancelled = false
    createRepository()
      .then((created) => {
        if (cancelled) return
        repositoryRef.current = created
        setRepository(created)
      })
      .catch((setupError: unknown) => {
        if (cancelled) return
        setError(
          setupError instanceof Error ? setupError.message : 'Could not start the data layer.',
        )
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const patch = useCallback(
    (update: Partial<Snapshot>) => {
      commit((current) => ({ ...current, ...update }))
    },
    [commit],
  )

  const refresh = useCallback(async () => {
    if (!repository) return
    setLoading(true)
    try {
      const loaded = await repo().loadSnapshot()

      // Quotes that ran past their validity date without a response become
      // expired the moment anyone looks — the contractor should never be
      // chasing a quote the customer can no longer accept.
      const lapsed = findLapsedQuotes(loaded.quotes)
      if (lapsed.length > 0) {
        const expired = lapsed.map(expireQuote)
        await Promise.all(expired.map((quote) => repo().upsertQuote(quote)))
        const expiredIds = new Set(expired.map((q) => q.id))
        loaded.quotes = loaded.quotes.map((q) => expired.find((e) => e.id === q.id) ?? q)

        const stale = loaded.followUps.filter(
          (f) => expiredIds.has(f.quote_id) && f.status === 'pending',
        )
        const skipped = cancelPendingFollowUps(stale)
        await Promise.all(skipped.map((f) => repo().upsertFollowUp(f)))
        loaded.followUps = loaded.followUps.map((f) => skipped.find((s) => s.id === f.id) ?? f)
      }

      snapshotRef.current = loaded
      setSnapshot(loaded)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your data.')
    } finally {
      setLoading(false)
    }
  }, [repository])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /* ---------------------------------------------------------------- */
  /* Lookups                                                          */
  /* ---------------------------------------------------------------- */

  const quoteById = useCallback(
    (id: string | null | undefined) => snapshot.quotes.find((q) => q.id === id),
    [snapshot.quotes],
  )

  const itemsForQuote = useCallback(
    (quoteId: string) =>
      snapshot.quoteItems
        .filter((i) => i.quote_id === quoteId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [snapshot.quoteItems],
  )

  const customerById = useCallback(
    (id: string | null | undefined) => snapshot.customers.find((c) => c.id === id),
    [snapshot.customers],
  )

  const customerForQuote = useCallback(
    (quote: Quote | undefined) => (quote ? customerById(quote.customer_id) : undefined),
    [customerById],
  )

  const followUpsForQuote = useCallback(
    (quoteId: string) =>
      snapshot.followUps
        .filter((f) => f.quote_id === quoteId)
        .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)),
    [snapshot.followUps],
  )

  const scanForQuote = useCallback(
    (quoteId: string) => snapshot.noteScans.find((s) => s.quote_id === quoteId),
    [snapshot.noteScans],
  )

  const jobForQuote = useCallback(
    (quoteId: string) => snapshot.jobs.find((j) => j.quote_id === quoteId),
    [snapshot.jobs],
  )

  /* ---------------------------------------------------------------- */
  /* Derived                                                          */
  /* ---------------------------------------------------------------- */

  const dueFollowUps = useMemo(() => {
    const cutoff = new Date()
    cutoff.setHours(23, 59, 59, 999)

    return snapshot.followUps
      .filter((f) => f.status === 'pending' && new Date(f.scheduled_for) <= cutoff)
      .map((followUp) => ({ followUp, quote: snapshot.quotes.find((q) => q.id === followUp.quote_id) }))
      // Only quotes still awaiting a response need chasing.
      .filter((entry): entry is { followUp: FollowUp; quote: Quote } =>
        entry.quote !== undefined && entry.quote.status === 'sent')
      .sort((a, b) => a.followUp.scheduled_for.localeCompare(b.followUp.scheduled_for))
  }, [snapshot.followUps, snapshot.quotes])

  const stats = useMemo(() => computeStats(snapshot.quotes), [snapshot.quotes])

  /* ---------------------------------------------------------------- */
  /* Mutations                                                        */
  /* ---------------------------------------------------------------- */

  const saveBusiness = useCallback(
    async (business: BusinessProfile) => {
      const saved = await repo().saveBusiness(business)
      patch({ business: saved })
    },
    [repo, patch],
  )

  const saveCustomer = useCallback(
    async (customer: Customer) => {
      const saved = await repo().upsertCustomer(customer)
      commit((s) => ({
        ...s,
        customers: s.customers.some((c) => c.id === saved.id)
          ? s.customers.map((c) => (c.id === saved.id ? saved : c))
          : [...s.customers, saved],
      }))
      return saved
    },
    [repo, commit],
  )

  const createCustomer = useCallback(
    (fields: Partial<Customer> & { name: string }) =>
      saveCustomer({
        phone: null,
        email: null,
        address: null,
        notes: null,
        ...fields,
        id: fields.id ?? newId(),
        business_id: snapshotRef.current.business.id,
        created_at: fields.created_at ?? nowIso(),
      }),
    [saveCustomer],
  )

  const removeCustomer = useCallback(
    async (id: string) => {
      await repo().deleteCustomer(id)
      commit((s) => ({
        ...s,
        customers: s.customers.filter((c) => c.id !== id),
        quotes: s.quotes.map((q) => (q.customer_id === id ? { ...q, customer_id: null } : q)),
      }))
    },
    [repo, commit],
  )

  const saveQuote = useCallback(
    async (quote: Quote) => {
      const saved = await repo().upsertQuote(quote)
      commit((s) => ({
        ...s,
        quotes: s.quotes.some((q) => q.id === saved.id)
          ? s.quotes.map((q) => (q.id === saved.id ? saved : q))
          : [saved, ...s.quotes],
      }))
      return saved
    },
    [repo, commit],
  )

  const saveQuoteRevision = useCallback(
    async (quote: Quote, items: QuoteItem[]) => {
      if (quote.status === 'draft') throw new Error('Draft quotes should be saved normally.')
      const totals = withRecalculatedTotals(quote, items)
      const result = await repo().createQuoteRevision(totals, items)
      commit((s) => ({
        ...s,
        revisions: [...s.revisions.filter((r) => r.id !== result.revision.id), result.revision],
        revisionItems: [...s.revisionItems.filter((i) => i.revision_id !== result.revision.id), ...result.items],
      }))
      return result.revision
    },
    [repo, commit],
  )

  const createQuote = useCallback(
    (overrides: Partial<Quote> = {}) =>
      saveQuote(
        createDraftQuote(snapshotRef.current.business, snapshotRef.current.quotes, overrides),
      ),
    [saveQuote],
  )

  const saveQuoteItems = useCallback(
    async (quoteId: string, items: QuoteItem[]) => {
      const ordered = resequence(items)
      await repo().replaceQuoteItems(quoteId, ordered)

      // Totals are recomputed here, from the items, every single time. There
      // is no path in the app that writes a total from anywhere else.
      const quote = snapshotRef.current.quotes.find((q) => q.id === quoteId)
      const updated = quote ? withRecalculatedTotals(quote, ordered) : undefined
      if (updated) await repo().upsertQuote(updated)

      commit((s) => ({
        ...s,
        quoteItems: [...s.quoteItems.filter((i) => i.quote_id !== quoteId), ...ordered],
        quotes: updated ? s.quotes.map((q) => (q.id === quoteId ? updated : q)) : s.quotes,
      }))
    },
    [repo, commit],
  )

  const removeQuote = useCallback(
    async (id: string) => {
      await repo().deleteQuote(id)
      commit((s) => ({
        ...s,
        quotes: s.quotes.filter((q) => q.id !== id),
        quoteItems: s.quoteItems.filter((i) => i.quote_id !== id),
        followUps: s.followUps.filter((f) => f.quote_id !== id),
        noteScans: s.noteScans.filter((n) => n.quote_id !== id),
      }))
    },
    [repo, commit],
  )

  const duplicateQuote = useCallback(
    async (quoteId: string) => {
      const source = snapshotRef.current.quotes.find((q) => q.id === quoteId)
      if (!source) throw new Error('Quote not found')

      const live = snapshotRef.current
      const copy = buildDuplicate(
        source,
        live.quoteItems
          .filter((item) => item.quote_id === quoteId)
          .sort((a, b) => a.sort_order - b.sort_order),
        live.quotes,
        live.business.default_validity_days,
      )
      await repo().upsertQuote(copy.quote)
      await repo().replaceQuoteItems(copy.quote.id, copy.items)

      commit((s) => ({
        ...s,
        quotes: [copy.quote, ...s.quotes],
        quoteItems: [...s.quoteItems, ...copy.items],
      }))
      return copy.quote
    },
    [repo, commit],
  )

  const markSent = useCallback(
    async (quoteId: string) => {
      const quote = snapshotRef.current.quotes.find((q) => q.id === quoteId)
      if (!quote) return

      const live = snapshotRef.current
      const customerName = live.customers.find((c) => c.id === quote.customer_id)?.name ?? ''
      const { quote: sent, followUps } = sendQuote(
        quote, customerName, live.business.default_validity_days,
      )
      await repo().upsertQuote(sent)
      // Sending is what lays down the follow-up schedule.
      await repo().replaceFollowUps(quoteId, followUps)

      commit((s) => ({
        ...s,
        quotes: s.quotes.map((q) => (q.id === quoteId ? sent : q)),
        followUps: [...s.followUps.filter((f) => f.quote_id !== quoteId), ...followUps],
      }))
    },
    [repo, commit],
  )

  const settleQuote = useCallback(
    async (quoteId: string, decision: 'accepted' | 'declined') => {
      const quote = snapshotRef.current.quotes.find((q) => q.id === quoteId)
      if (!quote) return

      let updated: Quote
      let job: Job | null = null
      if (decision === 'accepted') {
        const result = acceptQuote(quote)
        updated = result.quote
        job = result.job
        await repo().upsertJob(job)
      } else {
        updated = declineQuote(quote)
      }
      await repo().upsertQuote(updated)

      const cancelled = cancelPendingFollowUps(
        snapshotRef.current.followUps.filter((f) => f.quote_id === quoteId),
      )
      await Promise.all(cancelled.map((f) => repo().upsertFollowUp(f)))

      commit((s) => ({
        ...s,
        quotes: s.quotes.map((q) => (q.id === quoteId ? updated : q)),
        jobs: job ? [job, ...s.jobs] : s.jobs,
        followUps: s.followUps.map((f) => cancelled.find((c) => c.id === f.id) ?? f),
      }))
    },
    [repo, commit],
  )

  const markAccepted = useCallback((id: string) => settleQuote(id, 'accepted'), [settleQuote])
  const markDeclined = useCallback((id: string) => settleQuote(id, 'declined'), [settleQuote])

  /** Put a declined or expired quote back in front of the customer. */
  const reopenQuote = useCallback(
    async (quoteId: string) => {
      const quote = snapshotRef.current.quotes.find((q) => q.id === quoteId)
      if (!quote) return
      await saveQuote({ ...quote, status: 'draft', decided_at: null, sent_at: null, job_id: null })
    },
    [saveQuote],
  )

  const saveFollowUp = useCallback(
    async (followUp: FollowUp) => {
      const saved = await repo().upsertFollowUp(followUp)
      commit((s) => ({
        ...s,
        followUps: s.followUps.some((f) => f.id === saved.id)
          ? s.followUps.map((f) => (f.id === saved.id ? saved : f))
          : [...s.followUps, saved],
      }))
    },
    [repo, commit],
  )

  const setFollowUpStatus = useCallback(
    async (followUpId: string, status: FollowUp['status']) => {
      const followUp = snapshotRef.current.followUps.find((f) => f.id === followUpId)
      if (!followUp) return
      await saveFollowUp({
        ...followUp,
        status,
        // Only an explicit send stamps this. Nothing sends on its own.
        sent_manually_at: status === 'done' ? nowIso() : followUp.sent_manually_at,
      })
    },
    [saveFollowUp],
  )

  const completeFollowUp = useCallback(
    (id: string) => setFollowUpStatus(id, 'done'),
    [setFollowUpStatus],
  )
  const skipFollowUp = useCallback(
    (id: string) => setFollowUpStatus(id, 'skipped'),
    [setFollowUpStatus],
  )

  const scheduleFollowUp = useCallback(
    (quoteId: string, scheduledFor: string, draft: string | null = null) =>
      saveFollowUp({
        id: newId(),
        quote_id: quoteId,
        scheduled_for: scheduledFor,
        status: 'pending',
        draft_message: draft,
        sent_manually_at: null,
      }),
    [saveFollowUp],
  )

  const savePriceBookItem = useCallback(
    async (item: PriceBookItem) => {
      const saved = await repo().upsertPriceBookItem(item)
      commit((s) => ({
        ...s,
        priceBook: s.priceBook.some((p) => p.id === saved.id)
          ? s.priceBook.map((p) => (p.id === saved.id ? saved : p))
          : [...s.priceBook, saved],
      }))
      return saved
    },
    [repo, commit],
  )

  const removePriceBookItem = useCallback(
    async (id: string) => {
      await repo().deletePriceBookItem(id)
      commit((s) => ({ ...s, priceBook: s.priceBook.filter((p) => p.id !== id) }))
    },
    [repo, commit],
  )

  const saveNoteScan = useCallback(
    async (scan: NoteScan) => {
      const saved = await repo().upsertNoteScan(scan)
      commit((s) => ({
        ...s,
        noteScans: s.noteScans.some((n) => n.id === saved.id)
          ? s.noteScans.map((n) => (n.id === saved.id ? saved : n))
          : [saved, ...s.noteScans],
      }))
      return saved
    },
    [repo, commit],
  )

  const resetDemoData = useCallback(async () => {
    const current = repo()
    if (!current.resetDemoData) return
    const restored = await current.resetDemoData()
    snapshotRef.current = restored
    setSnapshot(restored)
  }, [repo])

  const value = useMemo<DataContextValue>(
    () => ({
      ...snapshot,
      loading, error, backend: repository?.kind ?? null, repository,
      quoteById, itemsForQuote, customerById, customerForQuote, followUpsForQuote,
      scanForQuote, jobForQuote, dueFollowUps, stats,
      saveBusiness, saveCustomer, createCustomer, removeCustomer,
      createQuote, saveQuote, saveQuoteRevision, saveQuoteItems, removeQuote, duplicateQuote,
      markSent, markAccepted, markDeclined, reopenQuote,
      saveFollowUp, completeFollowUp, skipFollowUp, scheduleFollowUp,
      savePriceBookItem, removePriceBookItem, saveNoteScan,
      refresh, resetDemoData,
    }),
    [
      snapshot, loading, error, repository, quoteById, itemsForQuote, customerById,
      customerForQuote, followUpsForQuote, scanForQuote, jobForQuote, dueFollowUps, stats,
      saveBusiness, saveCustomer, createCustomer, removeCustomer, createQuote, saveQuote,
      saveQuoteRevision, saveQuoteItems, removeQuote, duplicateQuote, markSent, markAccepted, markDeclined,
      reopenQuote, saveFollowUp, completeFollowUp, skipFollowUp, scheduleFollowUp,
      savePriceBookItem, removePriceBookItem, saveNoteScan, refresh, resetDemoData,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}
