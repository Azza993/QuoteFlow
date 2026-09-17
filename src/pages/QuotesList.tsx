import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, Plus, Search } from 'lucide-react'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { QuoteCard } from '@/components/QuoteCard'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { QUOTE_STATUSES, type QuoteStatus } from '@/types/domain'
import { STATUS_LABEL } from '@/components/StatusBadge'

type Filter = QuoteStatus | 'all'

export function QuotesList() {
  const { quotes, customerById } = useData()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')

  const filter = (params.get('status') ?? 'all') as Filter

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: quotes.length, draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0,
    }
    for (const quote of quotes) result[quote.status] += 1
    return result
  }, [quotes])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return quotes
      .filter((quote) => filter === 'all' || quote.status === filter)
      .filter((quote) => {
        if (!needle) return true
        const haystack = [
          quote.quote_number,
          quote.scope_summary,
          quote.site_address,
          customerById(quote.customer_id)?.name,
        ]
        return haystack.some((value) => value?.toLowerCase().includes(needle))
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [quotes, filter, search, customerById])

  const setFilter = (next: Filter) => {
    if (next === 'all') setParams({}, { replace: true })
    else setParams({ status: next }, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle={`${quotes.length} in total`}
        actions={
          <Button asChild className="hidden sm:inline-flex">
            <Link to="/quotes/new">
              <Plus /> New quote
            </Link>
          </Button>
        }
      />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by customer, address or quote number"
          className="pl-9"
          type="search"
          aria-label="Search quotes"
        />
      </div>

      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        {(['all', ...QUOTE_STATUSES] as Filter[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={cn(
              'shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
              filter === option
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
            )}
          >
            {option === 'all' ? 'All' : STATUS_LABEL[option]}
            <span className="ml-1.5 tabular-nums opacity-60">{counts[option]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<FileText className="size-5" />}
          title={search ? 'Nothing matches that search' : 'No quotes here yet'}
          description={
            search
              ? 'Try a customer name, a street, or a quote number.'
              : 'Quotes you create will show up in this list.'
          }
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                Clear search
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link to="/quotes/new">
                  <Plus /> New quote
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} />
          ))}
        </div>
      )}
    </div>
  )
}
