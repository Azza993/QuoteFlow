import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Loader2, Phone, Printer, X } from 'lucide-react'
import { useData } from '@/hooks/use-data'
import { QuoteDocument } from '@/components/QuoteDocument'
import { Button } from '@/components/ui/button'
import { LoadingState } from '@/components/LoadingState'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { PublicQuoteView } from '@/data/repository'
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
  const { repository } = useData()

  const [view, setView] = useState<PublicQuoteView | null>(null)
  const [loading, setLoading] = useState(true)
  const [deciding, setDeciding] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const load = useCallback(async () => {
    // The data layer picks its backend asynchronously at start-up.
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

  if (loading) {
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
            <p className="mt-1 text-sm text-ink-600">
              {formatDate(quote.decided_at)} ·{' '}
              {quote.status === 'accepted'
                ? `${business.business_name} has been notified and will be in touch to book the work in.`
                : `${business.business_name} has been notified. If you change your mind, just give them a call.`}
            </p>
            {business.contact_phone ? (
              <Button variant="secondary" className="mt-4" asChild>
                <a href={`tel:${business.contact_phone}`}>
                  <Phone /> {business.contact_phone}
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {expired ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 print-hide">
            <p className="text-base font-semibold text-amber-900">This quote has expired</p>
            <p className="mt-1 text-sm text-amber-800">
              It was valid until {formatDate(quote.valid_until)}. Get in touch with{' '}
              {business.business_name} for an up-to-date price.
            </p>
          </div>
        ) : null}

        <QuoteDocument quote={quote} items={items} customer={customer} business={business} />

        {!decided && !expired ? (
          <div className="mt-5 rounded-2xl border border-ink-200 bg-white p-5 shadow-card print-hide">
            <p className="text-base font-semibold text-ink-900">Happy with this quote?</p>
            <p className="mt-1 text-sm text-ink-500">
              Accepting lets {business.business_name} know to book the work in. Nothing is charged
              now.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="lg" className="flex-1" disabled={deciding}>
                    {deciding ? <Loader2 className="animate-spin" /> : <Check />}
                    Accept quote
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Accept this quote?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You're accepting {quote.quote_number} for{' '}
                    {formatMoney(quote.total, business.currency_code || 'NZD')} including{' '}
                    {business.tax_label}. {business.business_name} will be in touch to arrange a
                    time.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void decide('accepted')}>
                      Yes, accept
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary" size="lg" className="flex-1" disabled={deciding}>
                    <X /> Decline
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Decline this quote?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {business.business_name} will be let know you're not going ahead. You can still
                    call them if you'd like it revised instead.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Go back</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => void decide('declined')}
                    >
                      Decline
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {business.contact_phone ? (
              <p className="mt-4 text-center text-sm text-ink-500">
                Questions first?{' '}
                <a href={`tel:${business.contact_phone}`} className="font-medium text-brand-700">
                  Call {business.contact_phone}
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
