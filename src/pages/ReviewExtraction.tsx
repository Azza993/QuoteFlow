import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, Loader2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Field, Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ExtractedFieldRow } from '@/components/ExtractedField'
import { ConfidenceMark, confidenceLevel } from '@/components/ConfidenceMark'
import { NotFound } from './NotFound'
import { findCustomerMatch } from '@/data/actions'
import { centsToInput, inputToCents } from '@/lib/money'
import { newId } from '@/lib/utils'
import { LINE_ITEM_TYPES, NEEDS_REVIEW_THRESHOLD } from '@/types/domain'
import type { ExtractedLineItem, LineItemType, QuoteItem } from '@/types/domain'
import { TYPE_LABEL } from '@/components/LineItemEditor'

/** The editable shape of one extracted line, before it becomes a quote item. */
interface DraftLine {
  id: string
  include: boolean
  description: string
  quantity: number
  unit: string
  price: number | null
  type: LineItemType
  source: ExtractedLineItem
}

export function ReviewExtraction() {
  const { quoteId = '' } = useParams()
  const navigate = useNavigate()
  const {
    quoteById, scanForQuote, customers, saveQuote, saveQuoteItems, createCustomer, saveNoteScan,
  } = useData()

  const quote = quoteById(quoteId)
  const scan = quote ? scanForQuote(quote.id) : undefined
  const extraction = scan?.raw_extraction_json ?? null

  const [customerName, setCustomerName] = useState(extraction?.customer.name.value ?? '')
  const [customerPhone, setCustomerPhone] = useState(extraction?.customer.phone.value ?? '')
  const [customerEmail, setCustomerEmail] = useState(extraction?.customer.email.value ?? '')
  const [siteAddress, setSiteAddress] = useState(
    extraction?.site.address.value ?? extraction?.customer.address.value ?? '',
  )
  const [scope, setScope] = useState(extraction?.scope.value ?? '')
  const [notes, setNotes] = useState(extraction?.notes.value ?? '')
  const [saving, setSaving] = useState(false)

  const [lines, setLines] = useState<DraftLine[]>(() =>
    (extraction?.line_items ?? []).map((source) => ({
      id: newId(),
      include: true,
      description: source.description.value ?? '',
      quantity: source.quantity.value ?? 1,
      unit: source.unit.value ?? 'each',
      price: source.price_guess.value,
      type: source.type.value ?? 'service',
      source,
    })),
  )

  // Existing customer with the same phone or a near-identical name? Ask,
  // rather than quietly creating a second record for the same person.
  const match = useMemo(
    () => findCustomerMatch(customers, customerName, customerPhone),
    [customers, customerName, customerPhone],
  )
  const [linkExisting, setLinkExisting] = useState(true)

  if (!quote) return <NotFound />
  if (!scan || !extraction) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Nothing to review" back={{ to: `/quotes/${quote.id}`, label: 'Quote' }} />
        <Card>
          <CardContent className="p-5 text-sm text-ink-600">
            This quote has no scanned notes attached. You can fill it in from the quote builder
            instead.
          </CardContent>
        </Card>
      </div>
    )
  }

  const images = scan.image_urls
  const needsReview = countNeedsReview()

  const updateLine = (id: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  /**
   * Turn the reviewed values into a real quote. Prices confirmed here become
   * `selling_price`; anything left blank stays at zero so it's visibly
   * unpriced rather than quietly guessed at.
   */
  const confirm = async () => {
    setSaving(true)
    try {
      let customerId = quote.customer_id
      if (match && linkExisting) {
        customerId = match.customer.id
      } else if (customerName.trim()) {
        const created = await createCustomer({
          name: customerName.trim(),
          phone: customerPhone.trim() || null,
          email: customerEmail.trim() || null,
          address: siteAddress.trim() || null,
          notes: 'Created from scanned site notes.',
        })
        customerId = created.id
      }

      const items: QuoteItem[] = lines
        .filter((line) => line.include && line.description.trim())
        .map((line, index) => ({
          id: newId(),
          quote_id: quote.id,
          description: line.description.trim(),
          quantity: line.quantity,
          unit: line.unit,
          cost: null,
          markup: null,
          selling_price: line.price ?? 0,
          type: line.type,
          notes: null,
          sort_order: index,
        }))

      await saveQuote({
        ...quote,
        customer_id: customerId,
        site_address: siteAddress.trim() || null,
        scope_summary: [scope.trim(), notes.trim()].filter(Boolean).join('\n\n') || null,
      })
      await saveQuoteItems(quote.id, items)
      await saveNoteScan({ ...scan, status: 'reviewed' })

      toast.success('Quote built from your notes.')
      navigate(`/quotes/${quote.id}/edit`)
    } catch {
      toast.error("Couldn't save your changes. Nothing has been lost — try again.")
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-24 md:pb-0">
      <PageHeader
        title="Check what we read"
        subtitle="Everything here is editable. Tap any thumbnail to see the handwriting it came from."
        back={{ to: '/scan', label: 'Scan' }}
      />

      {needsReview > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {needsReview} field{needsReview === 1 ? '' : 's'} need{needsReview === 1 ? 's' : ''} a
              look
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
              These were hard to read. Nothing gets priced until you've confirmed them.
            </p>
          </div>
        </div>
      ) : null}

      {extraction.unreadable_notes.length > 0 ? (
        <Card className="mb-5 border-ink-200 bg-ink-100/50">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-ink-900">Couldn't be read</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-600">
              {extraction.unreadable_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {match ? (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <input
                  type="checkbox"
                  checked={linkExisting}
                  onChange={(event) => setLinkExisting(event.target.checked)}
                  className="mt-0.5 size-4 accent-sky-600"
                />
                <span className="text-sm">
                  <span className="flex items-center gap-1.5 font-semibold text-sky-900">
                    <UserCheck className="size-4" />
                    Is this {match.customer.name}?
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-sky-800">
                    You already have a customer with{' '}
                    {match.reason === 'phone' ? 'that phone number' : 'a very similar name'}.
                    Leave this ticked to use their record instead of creating a new one.
                  </span>
                </span>
              </label>
            ) : null}

            <ExtractedFieldRow label="Name" field={extraction.customer.name} images={images}>
              <Input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Customer name"
                disabled={Boolean(match && linkExisting)}
              />
            </ExtractedFieldRow>

            <ExtractedFieldRow label="Phone" field={extraction.customer.phone} images={images}>
              <Input
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Phone number"
                inputMode="tel"
                disabled={Boolean(match && linkExisting)}
              />
            </ExtractedFieldRow>

            <ExtractedFieldRow label="Email" field={extraction.customer.email} images={images}>
              <Input
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="Not on the page — add it if you have it"
                inputMode="email"
                disabled={Boolean(match && linkExisting)}
              />
            </ExtractedFieldRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Site &amp; scope</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ExtractedFieldRow label="Site address" field={extraction.site.address} images={images}>
              <Input
                value={siteAddress}
                onChange={(event) => setSiteAddress(event.target.value)}
                placeholder="Where the work happens"
              />
            </ExtractedFieldRow>

            <ExtractedFieldRow label="Scope" field={extraction.scope} images={images}>
              <Textarea
                value={scope}
                onChange={(event) => setScope(event.target.value)}
                rows={3}
                placeholder="What the job involves"
              />
            </ExtractedFieldRow>

            <ExtractedFieldRow label="Other notes" field={extraction.notes} images={images}>
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Access, timing, anything else worth keeping"
              />
            </ExtractedFieldRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items ({lines.filter((l) => l.include).length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 rounded-xl bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
              Prices read off the page are <strong className="font-semibold">suggestions only</strong>.
              Nothing is added to a total until you confirm it here — and the totals themselves are
              always worked out by QuoteFlow, never read from your notes.
            </p>

            <ul className="space-y-3">
              {lines.map((line) => (
                <LineRow key={line.id} line={line} />
              ))}
            </ul>

            {lines.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink-500">
                No line items could be read. You can add them in the quote builder.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 hidden md:block">
        <Button size="lg" className="w-full" onClick={confirm} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          Looks right — build the quote
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-[4.5rem] z-20 border-t border-ink-200 bg-white/95 p-3 backdrop-blur md:hidden">
        <Button size="lg" className="w-full" onClick={confirm} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          Build the quote
        </Button>
      </div>
    </div>
  )

  function LineRow({ line }: { line: DraftLine }) {
    const priceLevel = confidenceLevel(line.source.price_guess.confidence, line.price !== null)
    const qtyLevel = confidenceLevel(line.source.quantity.confidence, true)

    return (
      <li
        className={cnFor(line.include)}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={line.include}
            onChange={(event) => updateLine(line.id, { include: event.target.checked })}
            className="size-4 accent-brand-600"
            aria-label={`Include "${line.description || 'this line'}" on the quote`}
          />
          <span className="text-xs font-medium text-ink-500">
            {line.include ? 'On the quote' : 'Left off'}
          </span>
          {qtyLevel === 'check' || priceLevel !== 'good' ? (
            <Badge tone="warning" className="ml-auto">
              Needs a check
            </Badge>
          ) : null}
        </div>

        <ExtractedFieldRow
          label="Description"
          field={line.source.description}
          images={images}
          className="mb-3"
        >
          <Input
            value={line.description}
            onChange={(event) => updateLine(line.id, { description: event.target.value })}
            disabled={!line.include}
          />
        </ExtractedFieldRow>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Qty</Label>
              <ConfidenceMark level={qtyLevel} />
            </div>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.25"
              value={line.quantity}
              onChange={(event) =>
                updateLine(line.id, { quantity: Number.parseFloat(event.target.value) || 0 })
              }
              disabled={!line.include}
            />
          </div>

          <Field label="Unit">
            <Input
              value={line.unit}
              onChange={(event) => updateLine(line.id, { unit: event.target.value })}
              disabled={!line.include}
            />
          </Field>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Price each</Label>
              <ConfidenceMark level={priceLevel} />
            </div>
            <Input
              inputMode="decimal"
              value={centsToInput(line.price)}
              onChange={(event) => updateLine(line.id, { price: inputToCents(event.target.value) })}
              placeholder={line.price === null ? 'Not on the page' : '0.00'}
              disabled={!line.include}
              className={priceLevel !== 'good' ? 'border-amber-300 bg-amber-50/50' : undefined}
            />
          </div>

          <Field label="Type">
            <Select
              value={line.type}
              onChange={(event) =>
                updateLine(line.id, { type: event.target.value as LineItemType })
              }
              disabled={!line.include}
            >
              {LINE_ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </li>
    )
  }

  function countNeedsReview(): number {
    if (!extraction) return 0

    const scalar = [
      extraction.customer.name,
      extraction.customer.phone,
      extraction.site.address,
      extraction.scope,
    ].filter((field) => field.value !== null && field.confidence < NEEDS_REVIEW_THRESHOLD).length

    const perLine = extraction.line_items.reduce((count, item) => {
      const fields = [item.description, item.quantity, item.price_guess]
      return count + fields.filter((field) => field.confidence < NEEDS_REVIEW_THRESHOLD).length
    }, 0)

    return scalar + perLine
  }
}

function cnFor(include: boolean): string {
  return include
    ? 'rounded-2xl border border-ink-200 bg-white p-4'
    : 'rounded-2xl border border-ink-200 bg-ink-50 p-4 opacity-70'
}
