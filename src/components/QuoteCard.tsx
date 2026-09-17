import { Link } from 'react-router-dom'
import { MapPin, ScanLine } from 'lucide-react'
import type { Quote } from '@/types/domain'
import { useData } from '@/hooks/use-data'
import { StatusBadge } from './StatusBadge'
import { Money } from './Money'
import { formatDateShort, relativeDay } from '@/lib/dates'
import { cn } from '@/lib/utils'

export function QuoteCard({ quote, className }: { quote: Quote; className?: string }) {
  const { customerForQuote } = useData()
  const customer = customerForQuote(quote)

  return (
    <Link
      to={`/quotes/${quote.id}`}
      className={cn(
        'block rounded-2xl border border-ink-200 bg-white p-4 shadow-card transition-colors hover:border-ink-300 active:bg-ink-50',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink-900">
            {customer?.name ?? 'No customer yet'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
            <span className="font-medium text-ink-600">{quote.quote_number}</span>
            {quote.source === 'scan' ? (
              <span className="inline-flex items-center gap-1 text-ink-400">
                <ScanLine className="size-3" />
                scanned
              </span>
            ) : null}
          </p>
        </div>
        <StatusBadge status={quote.status} className="shrink-0" />
      </div>

      {quote.scope_summary ? (
        <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-ink-600">
          {quote.scope_summary}
        </p>
      ) : null}

      {quote.site_address ? (
        <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-ink-500">
          <MapPin className="size-3.5 shrink-0" />
          {quote.site_address}
        </p>
      ) : null}

      <div className="mt-3 flex items-end justify-between gap-3 border-t border-ink-100 pt-3">
        <p className="text-xs text-ink-500">{timingLabel(quote)}</p>
        <Money cents={quote.total} className="text-lg font-bold text-ink-900" />
      </div>
    </Link>
  )
}

function timingLabel(quote: Quote): string {
  switch (quote.status) {
    case 'draft':
      return `Started ${relativeDay(quote.created_at)}`
    case 'sent':
      return quote.valid_until
        ? `Sent ${relativeDay(quote.sent_at)} · valid to ${formatDateShort(quote.valid_until)}`
        : `Sent ${relativeDay(quote.sent_at)}`
    case 'accepted':
      return `Accepted ${relativeDay(quote.decided_at)}`
    case 'declined':
      return `Declined ${relativeDay(quote.decided_at)}`
    case 'expired':
      return `Expired ${relativeDay(quote.valid_until)}`
  }
}
