import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Copy, Link2, Pencil, Printer, Send } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { QuoteDocument } from '@/components/QuoteDocument'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { NotFound } from './NotFound'
import { publicTokenFor } from '@/data/repository'
import { formatMoney } from '@/lib/money'
import { formatDate } from '@/lib/dates'

export function QuotePreview() {
  const { quoteId = '' } = useParams()
  const navigate = useNavigate()
  const { quoteById, itemsForQuote, customerForQuote, business, markSent, revisions, revisionItems } = useData()

  const quote = quoteById(quoteId)
  const [sendOpen, setSendOpen] = useState(false)

  if (!quote) return <NotFound />

  const latestRevision = revisions
    .filter((r) => r.quote_id === quote.id)
    .sort((a, b) => b.revision_number - a.revision_number)[0]
  const displayQuote = latestRevision ? { ...quote, ...latestRevision, id: quote.id, quote_number: quote.quote_number } : quote
  const items = latestRevision
    ? revisionItems.filter((i) => i.revision_id === latestRevision.id).sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ ...i, quote_id: quote.id }))
    : itemsForQuote(quote.id)
  const customer = customerForQuote(displayQuote) ?? null
  // Supabase generates an opaque token that must be used verbatim. The
  // deterministic helper remains only as a demo-backend fallback.
  const token = latestRevision?.status !== 'draft' && latestRevision?.public_token
    ? latestRevision.public_token
    : quote.public_token ?? publicTokenFor(quote.id)
  const publicUrl = `${window.location.origin}/q/${token}`

  const emailBody = buildEmailBody()

  const send = async () => {
    try {
      await markSent(quote.id)
      setSendOpen(false)
      toast.success('Marked as sent — follow-ups are scheduled.')
      navigate(`/quotes/${quote.id}`)
    } catch {
      toast.error("Couldn't mark this quote as sent.")
    }
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied.`)
    } catch {
      toast.error('Copying is blocked in this browser — select the text instead.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Preview"
        subtitle={latestRevision?.status === 'draft' ? 'Pending revision — not yet sent to the customer.' : 'Exactly what your customer will see.'}
        back={{ to: `/quotes/${quote.id}`, label: 'Quote' }}
        actions={
          <div className="hidden gap-2 sm:flex">
            <Button variant="secondary" onClick={() => navigate(`/quotes/${quote.id}/edit`)}>
              <Pencil /> Edit
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer /> Print / PDF
            </Button>
            {quote.status === 'draft' || latestRevision?.status === 'draft' ? (
              <Button onClick={() => setSendOpen(true)}>
                <Send /> {quote.status === 'draft' ? 'Send' : 'Send revised quote'}
              </Button>
            ) : null}
          </div>
        }
      />

      <QuoteDocument
        quote={quote}
        items={items}
        customer={customer}
        business={business}
        className="mx-auto max-w-3xl"
      />

      <div className="mx-auto mt-4 flex max-w-3xl flex-wrap gap-2 sm:hidden print-hide">
        <Button variant="secondary" className="flex-1" onClick={() => navigate(`/quotes/${quote.id}/edit`)}>
          <Pencil /> Edit
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
          <Printer /> PDF
        </Button>
        {quote.status === 'draft' ? (
          <Button className="w-full" size="lg" onClick={() => setSendOpen(true)}>
            <Send /> {quote.status === 'draft' ? 'Send to customer' : 'Send revised quote'}
          </Button>
        ) : null}
      </div>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{quote.status === 'draft' ? 'Send this quote' : 'Send revised quote'}</DialogTitle>
            <DialogDescription>
              Copy the message and link into your email or messages app, then mark it as sent —
              that's what starts the follow-up reminders.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Customer link" hint="Your customer can accept or decline from this page.">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={publicUrl}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-ink-200 bg-ink-50 px-3 text-sm text-ink-600"
                  aria-label="Customer quote link"
                />
                <Button variant="secondary" onClick={() => void copy(publicUrl, 'Link')}>
                  <Link2 /> Copy
                </Button>
              </div>
            </Field>

            <Field label="Message" hint="Edit anything you like before sending.">
              <Textarea defaultValue={emailBody} rows={9} id="email-body" />
            </Field>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                const value =
                  (document.getElementById('email-body') as HTMLTextAreaElement | null)?.value ??
                  emailBody
                void copy(value, 'Message')
              }}
            >
              <Copy /> Copy message
            </Button>

            {customer?.email ? (
              <Button variant="secondary" asChild className="w-full">
                <a
                  href={`mailto:${customer.email}?subject=${encodeURIComponent(
                    `Quote ${quote.quote_number} — ${business.business_name}`,
                  )}&body=${encodeURIComponent(emailBody)}`}
                >
                  Open in your email app
                </a>
              </Button>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setSendOpen(false)}>
              Not yet
            </Button>
            <Button onClick={send}>
              <Send /> {quote.status === 'draft' ? 'Mark as sent' : 'I’ve sent the revised quote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )

  function buildEmailBody(): string {
    const firstName = (customer?.name ?? '').split(' ')[0] || 'there'
    const scope = quote!.scope_summary ? `\n\n${quote!.scope_summary}` : ''
    const validity = quote!.valid_until
      ? `\n\nThe quote is valid until ${formatDate(quote!.valid_until)}.`
      : ''

    return `Hi ${firstName},\n\nThanks for having me out. Here's quote ${quote!.quote_number} — ${formatMoney(
      quote!.total,
      business.currency_code || 'NZD',
    )} including ${business.tax_label}.${scope}\n\nYou can view it and accept or decline here:\n${publicUrl}${validity}\n\nAny questions, just give me a call.\n\nCheers,\n${business.business_name}\n${business.contact_phone ?? ''}`
  }
}
