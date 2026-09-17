import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, PenLine, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'

/**
 * Two ways in. Scanning is the hero — it's the reason to use QuoteFlow at all
 * — but the manual path is always one tap away and never feels like a
 * fallback.
 */
export function NewQuote() {
  const { createQuote } = useData()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const startManually = async () => {
    setCreating(true)
    try {
      const quote = await createQuote()
      navigate(`/quotes/${quote.id}/edit`, { replace: true })
    } catch {
      toast.error("Couldn't start a new quote. Please try again.")
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New quote"
        subtitle="Start from your site notes, or build it from scratch."
        back={{ to: '/quotes', label: 'Quotes' }}
      />

      <div className="space-y-4">
        <Link
          to="/scan"
          className="group block overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-white shadow-raised transition-transform active:scale-[0.99]"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white/15">
            <ScanLine className="size-7" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Scan notes</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-brand-50">
            Take photos of your handwritten notes. QuoteFlow reads the customer, the site,
            the scope and the line items — you check them before anything is priced.
          </p>
          <p className="mt-4 text-sm font-semibold text-white/90 group-hover:underline">
            Take photos →
          </p>
        </Link>

        <button
          type="button"
          onClick={startManually}
          disabled={creating}
          className="block w-full rounded-2xl border border-ink-200 bg-white p-6 text-left shadow-card transition-colors hover:border-ink-300 active:bg-ink-50 disabled:opacity-60"
        >
          <div className="flex size-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-600">
            {creating ? <Loader2 className="size-6 animate-spin" /> : <PenLine className="size-6" />}
          </div>
          <h2 className="mt-4 text-xl font-bold text-ink-900">Start manually</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
            Go straight to the quote builder and type it in. Pull items from your price book
            as you go.
          </p>
          <p className="mt-4 text-sm font-semibold text-brand-700">
            {creating ? 'Creating…' : 'Open the builder →'}
          </p>
        </button>
      </div>
    </div>
  )
}
