import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BellRing, Briefcase, CalendarClock, Check, Copy, Eye, MapPin, Pencil, ScanLine, Send,
  SkipForward, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { StatusBadge } from '@/components/StatusBadge'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { NotFound } from './NotFound'
import { TYPE_LABEL } from '@/components/LineItemEditor'
import { lineTotal } from '@/lib/money'
import { formatDate, relativeDay, isoDaysFromNow } from '@/lib/dates'
import { draftFollowUp } from '@/ai/draft-message'
import type { FollowUp } from '@/types/domain'
import { cn } from '@/lib/utils'

export function QuoteDetail() {
  const { quoteId = '' } = useParams()
  const navigate = useNavigate()
  const {
    quoteById, itemsForQuote, customerForQuote, followUpsForQuote, scanForQuote, jobForQuote,
    business, markAccepted, markDeclined, reopenQuote, removeQuote, duplicateQuote,
    saveFollowUp, skipFollowUp, scheduleFollowUp,
  } = useData()

  const quote = quoteById(quoteId)
  const [followUpTarget, setFollowUpTarget] = useState<FollowUp | null>(null)

  if (!quote) return <NotFound />

  const items = itemsForQuote(quote.id)
  const customer = customerForQuote(quote) ?? null
  const followUps = followUpsForQuote(quote.id)
  const scan = scanForQuote(quote.id)
  const job = jobForQuote(quote.id)
  const pending = followUps.filter((f) => f.status === 'pending')

  const skip = async (followUpId: string) => {
    try {
      await skipFollowUp(followUpId)
      toast.success('Follow-up skipped.')
    } catch {
      toast.error("Couldn't update that follow-up.")
    }
  }

  const addFollowUp = async () => {
    try {
      await scheduleFollowUp(quote!.id, isoDaysFromNow(7))
      toast.success('Follow-up scheduled for a week from today.')
    } catch {
      toast.error("Couldn't schedule that follow-up.")
    }
  }

  /** Records the message that actually went out, and closes the reminder. */
  const saveFollowUpMessage = async (followUp: FollowUp, message: string) => {
    await saveFollowUp({
      ...followUp,
      status: 'done',
      draft_message: message,
      sent_manually_at: new Date().toISOString(),
    })
  }

  const duplicate = async () => {
    try {
      const copy = await duplicateQuote(quote.id)
      toast.success(`Copied to ${copy.quote_number}.`)
      navigate(`/quotes/${copy.id}/edit`)
    } catch {
      toast.error("Couldn't duplicate this quote.")
    }
  }

  const settle = async (decision: 'accepted' | 'declined') => {
    try {
      if (decision === 'accepted') {
        await markAccepted(quote.id)
        toast.success('Accepted — a job has been created.')
      } else {
        await markDeclined(quote.id)
        toast.success('Marked as declined.')
      }
    } catch {
      toast.error("Couldn't update this quote.")
    }
  }

  return (
    <div>
      <PageHeader
        title={quote.quote_number}
        back={{ to: '/quotes', label: 'Quotes' }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={quote.status} />
            {quote.source === 'scan' ? (
              <Badge tone="muted">
                <ScanLine className="size-3" /> From scanned notes
              </Badge>
            ) : null}
          </span>
        }
        actions={
          <div className="hidden gap-2 sm:flex">
            <Button variant="secondary" onClick={duplicate}>
              <Copy /> Duplicate
            </Button>
            <Button variant="secondary" asChild>
              <Link to={`/quotes/${quote.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/quotes/${quote.id}/preview`}>
                <Eye /> Preview
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="space-y-5">
          {/* What to do next, stated plainly. */}
          <NextStep />

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Customer">
                {customer ? (
                  <Link to="/customers" className="font-medium text-brand-700 hover:underline">
                    {customer.name}
                  </Link>
                ) : (
                  <span className="text-ink-400">Not set</span>
                )}
              </Row>
              {customer?.phone ? (
                <Row label="Phone">
                  <a href={`tel:${customer.phone}`} className="text-brand-700 hover:underline">
                    {customer.phone}
                  </a>
                </Row>
              ) : null}
              <Row label="Site">
                {quote.site_address ? (
                  <span className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
                    {quote.site_address}
                  </span>
                ) : (
                  <span className="text-ink-400">Not set</span>
                )}
              </Row>
              <Row label="Valid until">{formatDate(quote.valid_until)}</Row>
              {quote.sent_at ? <Row label="Sent">{formatDate(quote.sent_at)}</Row> : null}
              {quote.decided_at ? (
                <Row label={quote.status === 'accepted' ? 'Accepted' : 'Declined'}>
                  {formatDate(quote.decided_at)}
                </Row>
              ) : null}
              {quote.scope_summary ? (
                <div className="border-t border-ink-100 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                    Scope
                  </p>
                  <p className="mt-1.5 whitespace-pre-line leading-relaxed text-ink-700">
                    {quote.scope_summary}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Line items ({items.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-ink-500">
                  Nothing on this quote yet.{' '}
                  <Link to={`/quotes/${quote.id}/edit`} className="text-brand-700 underline">
                    Add some lines
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-900">{item.description}</p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {item.quantity} {item.unit} · {TYPE_LABEL[item.type]}
                        </p>
                        {item.notes ? (
                          <p className="mt-1 text-xs italic text-ink-500">{item.notes}</p>
                        ) : null}
                      </div>
                      <Money cents={lineTotal(item)} className="shrink-0 text-sm font-semibold" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {scan ? (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>Source notes</CardTitle>
                <Button variant="secondary" size="sm" asChild>
                  <Link to={`/quotes/${quote.id}/review`}>Review extraction</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
                  {scan.image_urls.map((url, index) => (
                    <img
                      key={url}
                      src={url}
                      alt={`Site notes page ${index + 1}`}
                      className="h-36 w-auto shrink-0 rounded-xl border border-ink-200 object-cover"
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <FollowUpHistory />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">
                Quote total
              </p>
              <Money cents={quote.total} className="mt-1 block text-3xl font-bold text-ink-900" />
              <p className="mt-1 text-xs text-ink-500">
                Including {business.tax_label} of{' '}
                <Money cents={quote.gst_amount} className="font-medium" />
              </p>
            </CardContent>
          </Card>

          {job ? (
            <Card className="border-brand-200 bg-brand-50/60">
              <CardContent className="flex items-start gap-3 p-5">
                <Briefcase className="mt-0.5 size-5 shrink-0 text-brand-600" />
                <div>
                  <p className="text-sm font-semibold text-brand-900">Job created</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-brand-800">
                    Created {formatDate(job.created_at)} from this quote, with the site and
                    scope as they stood then.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="secondary" className="w-full justify-start" asChild>
                <Link to={`/quotes/${quote.id}/edit`}>
                  <Pencil /> Edit quote
                </Link>
              </Button>
              <Button variant="secondary" className="w-full justify-start" onClick={duplicate}>
                <Copy /> Duplicate as new draft
              </Button>
              {quote.status === 'sent' ? (
                <>
                  <Button variant="secondary" className="w-full justify-start" onClick={() => settle('accepted')}>
                    <Check /> Mark accepted
                  </Button>
                  <Button variant="secondary" className="w-full justify-start" onClick={() => settle('declined')}>
                    <X /> Mark declined
                  </Button>
                </>
              ) : null}
              {quote.status === 'declined' || quote.status === 'expired' ? (
                <Button
                  variant="secondary"
                  className="w-full justify-start"
                  onClick={() => void reopenQuote(quote.id)}
                >
                  <Send /> Reopen as draft
                </Button>
              ) : null}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="danger" className="w-full justify-start">
                    <Trash2 /> Delete quote
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Delete {quote.quote_number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes the quote, its line items and its follow-ups. It can't be undone.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel />
                    <AlertDialogAction
                      variant="primary"
                      className="bg-red-600 hover:bg-red-700"
                      onClick={async () => {
                        await removeQuote(quote.id)
                        toast.success('Quote deleted.')
                        navigate('/quotes')
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </aside>
      </div>

      <FollowUpDialog />
    </div>
  )

  function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="flex items-start justify-between gap-4">
        <span className="shrink-0 text-ink-500">{label}</span>
        <span className="text-right text-ink-900">{children}</span>
      </div>
    )
  }

  function NextStep() {
    if (quote!.status === 'draft') {
      return (
        <Card className="border-brand-200 bg-brand-50/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-semibold text-brand-900">Ready to send?</p>
              <p className="mt-0.5 text-xs text-brand-800">
                Check the preview, then send it and we'll schedule the follow-ups.
              </p>
            </div>
            <Button asChild>
              <Link to={`/quotes/${quote!.id}/preview`}>
                <Eye /> Preview &amp; send
              </Link>
            </Button>
          </CardContent>
        </Card>
      )
    }

    if (quote!.status === 'sent' && pending.length > 0) {
      const next = pending[0]
      const overdue = new Date(next.scheduled_for) <= new Date()
      return (
        <Card className={cn(overdue ? 'border-amber-200 bg-amber-50/70' : 'border-ink-200')}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-start gap-3">
              <BellRing
                className={cn('mt-0.5 size-5 shrink-0', overdue ? 'text-amber-600' : 'text-ink-400')}
              />
              <div>
                <p className="text-sm font-semibold text-ink-900">
                  {overdue ? 'Follow-up due' : 'Next follow-up'} {relativeDay(next.scheduled_for)}
                </p>
                <p className="mt-0.5 text-xs text-ink-600">
                  Nothing sends on its own — you write and send it yourself.
                </p>
              </div>
            </div>
            <Button onClick={() => setFollowUpTarget(next)}>
              <Send /> Follow up now
            </Button>
          </CardContent>
        </Card>
      )
    }

    if (quote!.status === 'expired') {
      return (
        <Card className="border-ink-200 bg-ink-100/60">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-semibold text-ink-900">This quote has expired</p>
              <p className="mt-0.5 text-xs text-ink-600">
                Reopen it as a draft to re-price and send again.
              </p>
            </div>
            <Button variant="secondary" onClick={duplicate}>
              <Copy /> Duplicate
            </Button>
          </CardContent>
        </Card>
      )
    }

    return null
  }

  function FollowUpHistory() {
    if (followUps.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Follow-ups</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink-500">
              Follow-ups are scheduled automatically once the quote is sent.
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Follow-ups</CardTitle>
          {quote!.status === 'sent' ? (
            <Button variant="ghost" size="sm" onClick={addFollowUp}>
              <CalendarClock /> Add
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {followUps.map((followUp) => (
              <li
                key={followUp.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">
                    {followUp.status === 'done'
                      ? `Sent ${relativeDay(followUp.sent_manually_at ?? followUp.scheduled_for)}`
                      : followUp.status === 'skipped'
                        ? 'Skipped'
                        : `Due ${relativeDay(followUp.scheduled_for)}`}
                  </p>
                  <p className="text-xs text-ink-500">{formatDate(followUp.scheduled_for)}</p>
                </div>
                {followUp.status === 'pending' && quote!.status === 'sent' ? (
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => setFollowUpTarget(followUp)}>
                      <Send /> Write
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void skip(followUp.id)}
                      aria-label="Skip this follow-up"
                    >
                      <SkipForward />
                    </Button>
                  </div>
                ) : (
                  <Badge tone={followUp.status === 'done' ? 'success' : 'muted'}>
                    {followUp.status === 'done' ? 'Done' : 'Skipped'}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    )
  }

  function FollowUpDialog() {
    const attempt = followUps.filter((f) => f.status === 'done').length
    const suggestion =
      followUpTarget?.draft_message ??
      draftFollowUp({
        quote: quote!,
        customer,
        businessName: business.business_name,
        attempt,
      })

    return (
      <Dialog open={followUpTarget !== null} onOpenChange={(open) => !open && setFollowUpTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Follow up on {quote!.quote_number}</DialogTitle>
            <DialogDescription>
              Here's a draft to start from. Edit it, send it however you like, then mark it done.
            </DialogDescription>
          </DialogHeader>

          <Field label="Message" htmlFor="follow-up-message">
            <Textarea id="follow-up-message" defaultValue={suggestion} rows={8} />
          </Field>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => void copyMessage()}
            >
              <Copy /> Copy
            </Button>
            {customer?.phone ? (
              <Button variant="secondary" className="flex-1" asChild>
                <a href={`sms:${customer.phone}`}>Text</a>
              </Button>
            ) : null}
            {customer?.email ? (
              <Button variant="secondary" className="flex-1" asChild>
                <a
                  href={`mailto:${customer.email}?subject=${encodeURIComponent(
                    `Quote ${quote!.quote_number}`,
                  )}`}
                >
                  Email
                </a>
              </Button>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setFollowUpTarget(null)}>
              Close
            </Button>
            <Button onClick={() => void markDone()}>
              <Check /> Mark as sent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )

    async function copyMessage() {
      const value =
        (document.getElementById('follow-up-message') as HTMLTextAreaElement | null)?.value ??
        suggestion
      try {
        await navigator.clipboard.writeText(value)
        toast.success('Message copied.')
      } catch {
        toast.error('Copying is blocked in this browser — select the text instead.')
      }
    }

    async function markDone() {
      const target = followUpTarget
      if (!target) return
      const value =
        (document.getElementById('follow-up-message') as HTMLTextAreaElement | null)?.value ??
        suggestion
      // Keep what was actually sent, not just the suggestion.
      await saveFollowUpMessage(target, value)
      setFollowUpTarget(null)
      toast.success('Follow-up logged.')
    }
  }
}
