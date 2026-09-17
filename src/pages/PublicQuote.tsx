import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Phone, Printer, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/hooks/use-data'
import { QuoteDocument } from '@/components/QuoteDocument'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/LoadingState'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { PublicQuoteView, Repository } from '@/data/repository'
import { createRepository } from '@/data'
import { formatDate } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

/**
 * The customer-facing quote.
 *
 * Deliberately outside the app shell: no navigation, no contractor tools,
 * nothing to sign into. Read the quote, then accept or decline.
 */
export function PublicQuote() {
  const { token = '' } = useParams()
  const [repository, setRepository] = useState<Repository | null>(null)

  const [view, setView] = useState<PublicQuoteView | null>(null)
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void createRepository().then((created) => {
      if (active) setRepository(created)
    }).catch(() => {
      if (active) setFailed('We could not connect to the quote service. Please try again later.')
    })
    return () => {
      active = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!repository) return
    setLoading(true)
    try {
      setView(await repository.loadPublicQuote(token))
      setFailed(null)
    } catch {
      setFailed('We could not load this quote. Please check the link, or contact the sender.')
    } finally {
      setLoading(false)
    }
  }, [repository, token])

  useEffect(() => {
    void load()
  }, [load])

  if (loading || !repository) {
    return (
      <div className="min-h-dvh bg-ink-50">
        <LoadingState label="Loading your quote…" />
      </div>
    )
  }

  if (failed || !view) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-4">
        <div className="max-w-sm rounded-2xl border border-ink-200 bg-white p-8 text-center shadow-card">
          <h1 className="text-lg font-semibold text-ink-900">Quote not available</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-500">
            {failed ??
              "This link isn't valid any more. The quote may have been withdrawn — get in touch with whoever sent it to you."}
          </p>
        </div>
      </div>
    )
  }

  const { quote, items, customer, business } = view
  const decided = quote.status === 'accepted' || quote.status === 'declined'
  const expired = quote.status === 'expired'

  const decide = async (decision: 'accepted' | 'declined') => {
    if (!repository) return
    setDeciding(true)
    try {
      await repository.decidePublicQuote(token, decision)
      await load()
    } catch {
      setFailed('We could not record that. Please try again, or contact the sender directly.')
    } finally {
      setDeciding(false)
    }
  }

  return (
    <div className="min-h-dvh bg-ink-50 pb-16">
      <header className="border-b border-ink-200 bg-white print-hide">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{business.business_name}</p>
            <p className="text-xs text-ink-500">Quote {quote.quote_number}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer /> Save PDF
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        {decided ? (
          <div
            className={`mb-5 rounded-2xl border p-5 print-hide ${
              quote.status === 'accepted'
                ? 'border-brand-200 bg-brand-50'
                : 'border-ink-200 bg-ink-100'
            }`}
          >
            <p
              className={`text-base font-semibold ${
                quote.status === 'accepted' ? 'text-brand-900' : 'text-ink-800'
              }`}
            >
              {quote.status === 'accepted'
                ? 'You accepted this quote.'
                : 'You declined this quote.'}
            </p>
            <p className="mt-1 text-sm text-ink-600">Thank you for letting us know.</p>
          </div>
        ) : expired ? (
          <div className="mb-5 rounded-2xl border border-ink-200 bg-ink-100 p-5 print-hide">
            <p className="text-base font-semibold text-ink-800">This quote has expired.</p>
            <p className="mt-1 text-sm text-ink-600">Please contact the sender if you'd like an updated quote.</p>
          </div>
        ) : null}

        <QuoteDocument quote={quote} items={items} customer={customer} business={business} />

        {!decided && !expired ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 print-hide">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg" disabled={deciding}>
                  <Check /> Accept quote
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>Accept this quote?</AlertDialogTitle>
                <AlertDialogDescription>
                  This records your acceptance and lets the contractor start the job.
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>Not yet</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void decide('accepted')}>Accept quote</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="secondary" size="lg" disabled={deciding}>
                  <X /> Decline
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogTitle>Decline this quote?</AlertDialogTitle>
                <AlertDialogDescription>
                  The contractor will be notified that you declined the quote.
                </AlertDialogDescription>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep quote</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void decide('declined')}>Decline quote</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-ink-400 print-hide">
          <Phone className="size-3.5" />
          Questions? Contact {business.contact_phone ?? business.contact_email ?? 'the sender'}.
        </div>

        <p className="mt-3 text-center text-xs text-ink-400 print-hide">
          Quote generated {formatDate(quote.created_at)} · {formatMoney(quote.total, business.currency_code)}
        </p>
      </div>
    </div>
  )
}
