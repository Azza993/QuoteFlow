import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { BusinessProfile, Customer, FollowUp, Job, NoteScan, PriceBookItem, Quote, QuoteItem } from '@/types/domain'
import { createDraftQuote, duplicateQuote as buildDuplicate, sendQuote, acceptQuote, declineQuote, withRecalculatedTotals, cancelPendingFollowUps, findLapsedQuotes, computeStats, resequence } from './actions'
import { createRepository, type Snapshot } from './index'
import { newId } from '@/lib/utils'
import { nowIso } from '@/lib/dates'
import { draftFollowUpMessage } from '@/lib/follow-ups'
import type { Repository } from './repository'
import { DataContext } from './context'

// NOTE: This file is intentionally kept behaviourally identical to main except
// for the production-safety guard in removeQuote. Accepted quotes are now
// immutable historical records and must not be hard-deleted.

export function DataProvider({ children }: { children: ReactNode }) {
  const [repository, setRepository] = useState<Repository | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const snapshotRef = useRef<Snapshot | null>(null)

  const commit = useCallback((updater: (current: Snapshot) => Snapshot) => {
    setSnapshot((current) => {
      if (!current) return current
      const next = updater(current)
      snapshotRef.current = next
      return next
    })
  }, [])

  const patch = useCallback((partial: Partial<Snapshot>) => {
    setSnapshot((current) => {
      if (!current) return current
      const next = { ...current, ...partial }
      snapshotRef.current = next
      return next
    })
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const repo = await createRepository()
      const initial = await repo.loadSnapshot()
      if (!alive) return
      setRepository(repo)
      setSnapshot(initial)
      snapshotRef.current = initial
    })()
    return () => { alive = false }
  }, [])

  const repo = useCallback(() => {
    if (!repository) throw new Error('Data backend is still loading')
    return repository
  }, [repository])

  const quoteById = useCallback((id: string | null | undefined) => snapshot?.quotes.find((q) => q.id === id), [snapshot?.quotes])
  const itemsForQuote = useCallback((quoteId: string) => snapshot?.quoteItems.filter((i) => i.quote_id === quoteId).sort((a, b) => a.sort_order - b.sort_order) ?? [], [snapshot?.quoteItems])
  const customerById = useCallback((id: string | null | undefined) => snapshot?.customers.find((c) => c.id === id), [snapshot?.customers])
  const customerForQuote = useCallback((quote: Quote | undefined) => quote ? customerById(quote.customer_id) : undefined, [customerById])
  const followUpsForQuote = useCallback((quoteId: string) => snapshot?.followUps.filter((f) => f.quote_id === quoteId).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for)) ?? [], [snapshot?.followUps])
  const scanForQuote = useCallback((quoteId: string) => snapshot?.noteScans.find((s) => s.quote_id === quoteId), [snapshot?.noteScans])
  const jobForQuote = useCallback((quoteId: string) => snapshot?.jobs.find((j) => j.quote_id === quoteId), [snapshot?.jobs])

  const dueFollowUps = useMemo(() => {
    if (!snapshot) return []
    const cutoff = new Date()
    cutoff.setHours(23, 59, 59, 999)
    return snapshot.followUps
      .filter((f) => f.status === 'pending' && new Date(f.scheduled_for) <= cutoff)
      .map((followUp) => ({ followUp, quote: snapshot.quotes.find((q) => q.id === followUp.quote_id) }))
      .filter((entry): entry is { followUp: FollowUp; quote: Quote } => entry.quote !== undefined && entry.quote.status === 'sent')
      .sort((a, b) => a.followUp.scheduled_for.localeCompare(b.followUp.scheduled_for))
  }, [snapshot])

  const stats = useMemo(() => computeStats(snapshot?.quotes ?? []), [snapshot?.quotes])

  const saveBusiness = useCallback(async (business: BusinessProfile) => {
    const saved = await repo().saveBusiness(business)
    patch({ business: saved })
  }, [repo, patch])

  const saveCustomer = useCallback(async (customer: Customer) => {
    const saved = await repo().upsertCustomer(customer)
    commit((s) => ({ ...s, customers: s.customers.some((c) => c.id === saved.id) ? s.customers.map((c) => c.id === saved.id ? saved : c) : [...s.customers, saved] }))
    return saved
  }, [repo, commit])

  const createCustomer = useCallback((fields: Partial<Customer> & { name: string }) => saveCustomer({ phone: null, email: null, address: null, notes: null, ...fields, id: fields.id ?? newId(), business_id: snapshotRef.current!.business.id, created_at: fields.created_at ?? nowIso() }), [saveCustomer])

  const removeCustomer = useCallback(async (id: string) => {
    await repo().deleteCustomer(id)
    commit((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id), quotes: s.quotes.map((q) => q.customer_id === id ? { ...q, customer_id: null } : q) }))
  }, [repo, commit])

  const saveQuote = useCallback(async (quote: Quote) => {
    const saved = await repo().upsertQuote(quote)
    commit((s) => ({ ...s, quotes: s.quotes.some((q) => q.id === saved.id) ? s.quotes.map((q) => q.id === saved.id ? saved : q) : [saved, ...s.quotes] }))
    return saved
  }, [repo, commit])

  const createQuote = useCallback((overrides: Partial<Quote> = {}) => saveQuote(createDraftQuote(snapshotRef.current!.business, snapshotRef.current!.quotes, overrides)), [saveQuote])

  const saveQuoteItems = useCallback(async (quoteId: string, items: QuoteItem[]) => {
    const ordered = resequence(items)
    await repo().replaceQuoteItems(quoteId, ordered)
    const quote = snapshotRef.current!.quotes.find((q) => q.id === quoteId)
    const updated = quote ? withRecalculatedTotals(quote, ordered) : undefined
    if (updated) await repo().upsertQuote(updated)
    commit((s) => ({ ...s, quoteItems: [...s.quoteItems.filter((i) => i.quote_id !== quoteId), ...ordered], quotes: updated ? s.quotes.map((q) => q.id === quoteId ? updated : q) : s.quotes }))
  }, [repo, commit])

  const removeQuote = useCallback(async (id: string) => {
    const quote = snapshotRef.current?.quotes.find((q) => q.id === id)
    if (!quote) return
    if (quote.status === 'accepted') {
      throw new Error('Accepted quotes are historical records and cannot be deleted. Archive them instead.')
    }
    await repo().deleteQuote(id)
    commit((s) => ({ ...s, quotes: s.quotes.filter((q) => q.id !== id), quoteItems: s.quoteItems.filter((i) => i.quote_id !== id), followUps: s.followUps.filter((f) => f.quote_id !== id), noteScans: s.noteScans.filter((n) => n.quote_id !== id) }))
  }, [repo, commit])

  const duplicateQuote = useCallback(async (quoteId: string) => {
    const source = snapshotRef.current!.quotes.find((q) => q.id === quoteId)
    if (!source) throw new Error('Quote not found')
    const live = snapshotRef.current!
    const copy = buildDuplicate(source, live.quoteItems.filter((item) => item.quote_id === quoteId).sort((a, b) => a.sort_order - b.sort_order), live.quotes, live.business.default_validity_days)
    await repo().upsertQuote(copy.quote)
    await repo().replaceQuoteItems(copy.quote.id, copy.items)
    commit((s) => ({ ...s, quotes: [copy.quote, ...s.quotes], quoteItems: [...s.quoteItems, ...copy.items] }))
    return copy.quote
  }, [repo, commit])

  const markSent = useCallback(async (quoteId: string) => {
    const quote = snapshotRef.current!.quotes.find((q) => q.id === quoteId)
    if (!quote) return
    const live = snapshotRef.current!
    const customerName = live.customers.find((c) => c.id === quote.customer_id)?.name ?? ''
    const { quote: sent, followUps } = sendQuote(quote, customerName, live.business.default_validity_days)
    await repo().upsertQuote(sent)
    await repo().replaceFollowUps(quoteId, followUps)
    commit((s) => ({ ...s, quotes: s.quotes.map((q) => q.id === quoteId ? sent : q), followUps: [...s.followUps.filter((f) => f.quote_id !== quoteId), ...followUps] }))
  }, [repo, commit])

  const settleQuote = useCallback(async (quoteId: string, decision: 'accepted' | 'declined') => {
    const quote = snapshotRef.current!.quotes.find((q) => q.id === quoteId)
    if (!quote) return
    let updated: Quote
    let job: Job | null = null
    if (decision === 'accepted') {
      const result = acceptQuote(quote)
      updated = result.quote
      job = result.job
      await repo().upsertJob(job)
    } else updated = declineQuote(quote)
    await repo().upsertQuote(updated)
    const cancelled = cancelPendingFollowUps(snapshotRef.current!.followUps.filter((f) => f.quote_id === quoteId))
    await Promise.all(cancelled.map((f) => repo().upsertFollowUp(f)))
    commit((s) => ({ ...s, quotes: s.quotes.map((q) => q.id === quoteId ? updated : q), jobs: job ? [job, ...s.jobs] : s.jobs, followUps: s.followUps.map((f) => cancelled.find((c) => c.id === f.id) ?? f) }))
  }, [repo, commit])

  const markAccepted = useCallback((id: string) => settleQuote(id, 'accepted'), [settleQuote])
  const markDeclined = useCallback((id: string) => settleQuote(id, 'declined'), [settleQuote])
  const reopenQuote = useCallback(async (quoteId: string) => {
    const quote = snapshotRef.current!.quotes.find((q) => q.id === quoteId)
    if (!quote) return
    await saveQuote({ ...quote, status: 'draft', decided_at: null, sent_at: null, job_id: null })
  }, [saveQuote])
  const saveFollowUp = useCallback(async (followUp: FollowUp) => {
    const saved = await repo().upsertFollowUp(followUp)
    commit((s) => ({ ...s, followUps: s.followUps.some((f) => f.id === saved.id) ? s.followUps.map((f) => f.id === saved.id ? saved : f) : [...s.followUps, saved] }))
  }, [repo, commit])
  const setFollowUpStatus = useCallback(async (followUpId: string, status: FollowUp['status']) => {
    const followUp = snapshotRef.current!.followUps.find((f) => f.id === followUpId)
    if (!followUp) return
    await saveFollowUp({ ...followUp, status, sent_manually_at: status === 'done' ? nowIso() : followUp.sent_manually_at })
  }, [saveFollowUp])
  const completeFollowUp = useCallback((id: string) => setFollowUpStatus(id, 'done'), [setFollowUpStatus])
  const skipFollowUp = useCallback((id: string) => setFollowUpStatus(id, 'skipped'), [setFollowUpStatus])
  const scheduleFollowUp = useCallback((quoteId: string, scheduledFor: string, draft: string | null = null) => saveFollowUp({ id: newId(), quote_id: quoteId, scheduled_for: scheduledFor, status: 'pending', draft_message: draft ?? draftFollowUpMessage(snapshotRef.current!.quotes.find((q) => q.id === quoteId)!, snapshotRef.current!.customers.find((c) => c.id === snapshotRef.current!.quotes.find((q) => q.id === quoteId)?.customer_id)?.name ?? 'there'), sent_manually_at: null }), [saveFollowUp])
  const saveNoteScan = useCallback(async (scan: NoteScan) => {
    const saved = await repo().upsertNoteScan(scan)
    commit((s) => ({ ...s, noteScans: s.noteScans.some((n) => n.id === saved.id) ? s.noteScans.map((n) => n.id === saved.id ? saved : n) : [...s.noteScans, saved] }))
  }, [repo, commit])
  const resetDemoData = useCallback(async () => {
    if (!repository?.resetDemoData) throw new Error('Demo reset is unavailable on the Supabase backend.')
    const next = await repository.resetDemoData()
    setSnapshot(next)
    snapshotRef.current = next
    return next
  }, [repository])

  if (!snapshot || !repository) return null

  return <DataContext.Provider value={{ snapshot, repository, business: snapshot.business, customers: snapshot.customers, quotes: snapshot.quotes, quoteItems: snapshot.quoteItems, priceBook: snapshot.priceBook, followUps: snapshot.followUps, jobs: snapshot.jobs, noteScans: snapshot.noteScans, backend: repository.kind, quoteById, itemsForQuote, customerById, customerForQuote, followUpsForQuote, scanForQuote, jobForQuote, dueFollowUps, stats, saveBusiness, saveCustomer, createCustomer, removeCustomer, saveQuote, createQuote, saveQuoteItems, removeQuote, duplicateQuote, markSent, markAccepted, markDeclined, reopenQuote, saveFollowUp, completeFollowUp, skipFollowUp, scheduleFollowUp, saveNoteScan, resetDemoData }}>
    {children}
  </DataContext.Provider>
}
