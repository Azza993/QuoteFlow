import { Link } from 'react-router-dom'
import {
  ArrowRight, BellRing, CheckCircle2, FileText, Plus, ScanLine, TrendingUp,
} from 'lucide-react'
import { useData } from '@/hooks/use-data'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/EmptyState'
import { QuoteCard } from '@/components/QuoteCard'
import { Money } from '@/components/Money'
import { relativeDay } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { QuoteStatus } from '@/types/domain'

const STATUS_TILES: Array<{ status: QuoteStatus; label: string; accent: string }> = [
  { status: 'draft', label: 'Drafts', accent: 'text-ink-700' },
  { status: 'sent', label: 'Awaiting response', accent: 'text-sky-700' },
  { status: 'accepted', label: 'Accepted', accent: 'text-brand-700' },
  { status: 'declined', label: 'Declined', accent: 'text-red-700' },
]

export function Dashboard() {
  const { quotes, stats, dueFollowUps, customerById, business } = useData()

  const recent = quotes
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-500">{greeting()}</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
          {business.business_name}
        </h1>
      </div>

      {/* Scanning notes is the hero path — it's what the app is for. */}
      <Card className="overflow-hidden border-brand-200 bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-raised">
        <CardContent className="p-5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-bold">Got site notes?</h2>
              <p className="mt-1 max-w-sm text-sm text-brand-50">
                Photograph your handwriting and QuoteFlow will pull out the customer, the
                scope and the line items for you to check.
              </p>
            </div>
            <Button asChild size="lg" variant="secondary" className="w-full shrink-0 sm:w-auto">
              <Link to="/scan">
                <ScanLine /> Scan notes
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Follow-ups due — the number this app exists to keep at zero. */}
      <FollowUpsDue />

      <section>
        <h2 className="sr-only">Quotes by status</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATUS_TILES.map(({ status, label, accent }) => (
            <Link
              key={status}
              to={`/quotes?status=${status}`}
              className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card transition-colors hover:border-ink-300"
            >
              <p className={cn('text-3xl font-bold tabular-nums', accent)}>
                {stats.byStatus[status]}
              </p>
              <p className="mt-1 text-sm text-ink-500">{label}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <TrendingUp className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums text-ink-900">
                {stats.winRate === null ? '—' : `${stats.winRate}%`}
              </p>
              <p className="text-sm text-ink-500">
                {stats.winRate === null
                  ? 'No quotes sent yet'
                  : `${stats.acceptedCount} accepted of ${stats.sentCount} sent`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <Money cents={stats.awaitingValue} className="text-2xl font-bold text-ink-900" />
              <p className="text-sm text-ink-500">Out with customers</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink-900">Recent quotes</h2>
          <Link
            to="/quotes"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            See all <ArrowRight className="size-4" />
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-5" />}
            title="No quotes yet"
            description="Start with a photo of your site notes, or build one from scratch."
            action={
              <Button asChild size="lg">
                <Link to="/quotes/new">
                  <Plus /> New quote
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} />
            ))}
          </div>
        )}
      </section>
    </div>
  )

  function FollowUpsDue() {
    if (dueFollowUps.length === 0) {
      return (
        <Card className="border-brand-200 bg-brand-50/60">
          <CardContent className="flex items-center gap-3 p-5">
            <CheckCircle2 className="size-5 shrink-0 text-brand-600" />
            <p className="text-sm font-medium text-brand-800">
              Nothing to chase today — every sent quote is up to date.
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card className="border-amber-200 bg-amber-50/70">
        <CardHeader className="flex-row items-center gap-2.5">
          <BellRing className="size-5 shrink-0 text-amber-600" />
          <CardTitle className="text-amber-900">
            {dueFollowUps.length} follow-up{dueFollowUps.length === 1 ? '' : 's'} due
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dueFollowUps.slice(0, 3).map(({ followUp, quote }) => (
            <Link
              key={followUp.id}
              to={`/quotes/${quote.id}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 transition-colors hover:border-amber-300"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">
                  {customerById(quote.customer_id)?.name ?? 'No customer'}
                </p>
                <p className="text-xs text-ink-500">
                  {quote.quote_number} · due {relativeDay(followUp.scheduled_for)}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-ink-400" />
            </Link>
          ))}
          {dueFollowUps.length > 3 ? (
            <p className="pt-1 text-xs text-amber-800">
              …and {dueFollowUps.length - 3} more.
            </p>
          ) : null}
        </CardContent>
      </Card>
    )
  }
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
