import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BookOpen, Eye, Loader2, Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/EmptyState'
import { LineItemEditor } from '@/components/LineItemEditor'
import { PriceBookPicker, priceBookItemToQuoteItem } from '@/components/PriceBookPicker'
import { TotalsPanel } from '@/components/TotalsPanel'
import { NotFound } from './NotFound'
import { blankQuoteItem } from '@/data/actions'
import type { Quote, QuoteItem } from '@/types/domain'
import { fromDateInput, toDateInput } from '@/lib/dates'

export function QuoteBuilder() {
  const { quoteId = '' } = useParams()
  const navigate = useNavigate()
  const {
    quoteById, itemsForQuote, customers, business, saveQuote, saveQuoteItems, saveQuoteRevision, createCustomer,
  } = useData()

  const quote = quoteById(quoteId)

  const [draft, setDraft] = useState<Quote | null>(null)
  const [items, setItems] = useState<QuoteItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  /*
   * Load the quote into the editor once per quote, not every time the store
   * changes. Re-syncing on every store update would throw away whatever the
   * contractor has typed but not yet saved the moment anything else touched
   * the data.
   */
  const loadedId = useRef<string | null>(null)
  useEffect(() => {
    if (!quote || loadedId.current === quote.id) return
    loadedId.current = quote.id
    setDraft(quote)
    setItems(itemsForQuote(quote.id))
    setDirty(false)
  }, [quote, itemsForQuote])

  // Nothing is lost by accident if the phone rings mid-quote.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  if (!quote || !draft) return <NotFound />

  const update = <K extends keyof Quote>(key: K, value: Quote[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setDirty(true)
  }

  const updateItems = (next: QuoteItem[]) => {
    setItems(next)
    setDirty(true)
  }

  const addBlankItem = () => updateItems([...items, blankQuoteItem(quote.id, items.length)])

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    updateItems(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      if (quote.status === 'draft') {
        await saveQuote(draft)
        await saveQuoteItems(quote.id, items)
      } else {
        await saveQuoteRevision(draft, items)
      }
      setDirty(false)
      return true
    } catch {
      toast.error("Couldn't save this quote. Please try again.")
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveAndPreview = async () => {
    if (await save()) navigate(`/quotes/${quote.id}/preview`)
  }

  const onCustomerChange = async (value: string) => {
    if (value !== '__new__') {
      update('customer_id', value || null)
      return
    }
    const name = window.prompt('New customer name')?.trim()
    if (!name) return
    try {
      const customer = await createCustomer({ name })
      update('customer_id', customer.id)
      toast.success(`${customer.name} added.`)
    } catch {
      toast.error("Couldn't add that customer.")
    }
  }

  return (
    <div className="pb-24 md:pb-0">
      <PageHeader
        title={quote.quote_number}
        subtitle={quote.status === 'draft' ? 'Draft' : 'Editing a quote already sent'}
        back={{ to: `/quotes/${quote.id}`, label: 'Quote' }}
        actions={
          <Button variant="secondary" onClick={saveAndPreview} disabled={saving}>
            <Eye /> Preview
          </Button>
        }
      />

      {quote.status !== 'draft' ? (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This quote has already been accepted. Changes are saved as a revision and won't replace the
          accepted quote until the revised quote is sent to the customer.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Customer &amp; site</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Customer" htmlFor="customer">
                <Select
                  id="customer"
                  value={draft.customer_id ?? ''}
                  onChange={(event) => void onCustomerChange(event.target.value)}
                >
                  <option value="">No customer selected</option>
                  {customers
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  <option value="__new__">+ Add a new customer…</option>
                </Select>
              </Field>

              <Field label="Site address" htmlFor="site">
                <Input
                  id="site"
                  value={draft.site_address ?? ''}
                  onChange={(event) => update('site_address', event.target.value || null)}
                  placeholder="Where the work happens"
                />
              </Field>

              <Field
                label="Scope of work"
                htmlFor="scope"
                hint="A plain-English summary the customer will read first."
              >
                <Textarea
                  id="scope"
                  value={draft.scope_summary ?? ''}
                  onChange={(event) => update('scope_summary', event.target.value || null)}
                  placeholder="e.g. Kitchen and laundry rewire — replace the switchboard and add RCD protection."
                  rows={3}
                />
              </Field>
            </CardContent>
          </Card>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink-900">
                Line items{' '}
                <span className="font-normal text-ink-500">({items.length})</span>
              </h2>
              <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                <BookOpen /> Price book
              </Button>
            </div>

            {items.length === 0 ? (
              <EmptyState
                icon={<Plus className="size-5" />}
                title="No line items yet"
                description="Add what you're charging for. Pull from your price book or type them in."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={addBlankItem}>
                      <Plus /> Add a line
                    </Button>
                    <Button variant="secondary" onClick={() => setPickerOpen(true)}>
                      <BookOpen /> From price book
                    </Button>
                  </div>
                }
              />
            ) : (
              <ul className="space-y-3">
                {items.map((item, index) => (
                  <LineItemEditor
                    key={item.id}
                    item={item}
                    index={index}
                    total={items.length}
                    onChange={(next) =>
                      updateItems(items.map((existing) => (existing.id === next.id ? next : existing)))
                    }
                    onRemove={() => updateItems(items.filter((existing) => existing.id !== item.id))}
                    onMove={(direction) => moveItem(index, direction)}
                  />
                ))}
              </ul>
            )}

            {items.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={addBlankItem}>
                  <Plus /> Add a line
                </Button>
              </div>
            ) : null}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Terms &amp; validity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Valid until" htmlFor="valid-until">
                <Input
                  id="valid-until"
                  type="date"
                  value={toDateInput(draft.valid_until)}
                  onChange={(event) => update('valid_until', fromDateInput(event.target.value))}
                />
              </Field>
              <Field label="Terms" htmlFor="terms">
                <Textarea
                  id="terms"
                  value={draft.terms ?? ''}
                  onChange={(event) => update('terms', event.target.value || null)}
                  rows={4}
                />
              </Field>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <TotalsPanel
            items={items}
            gstInclusive={draft.gst_inclusive}
            gstRate={draft.gst_rate}
            taxLabel={business.tax_label}
          />

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    Prices include {business.tax_label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-500">
                    {draft.gst_inclusive
                      ? `The prices you type already include ${business.tax_label}.`
                      : `${business.tax_label} is added on top of the prices you type.`}
                  </p>
                </div>
                <Switch
                  checked={draft.gst_inclusive}
                  onCheckedChange={(checked) => update('gst_inclusive', checked)}
                  aria-label={`Prices include ${business.tax_label}`}
                />
              </div>
              <p className="mt-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
                Your business default is{' '}
                <strong className="font-semibold text-ink-700">
                  {business.gst_inclusive ? 'inclusive' : 'exclusive'}
                </strong>
                . <Link to="/settings" className="text-brand-700 underline">Change it in settings</Link>.
              </p>
            </CardContent>
          </Card>

          <div className="hidden lg:block">
            <Button className="w-full" size="lg" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
          </div>
        </aside>
      </div>

      {/* Sticky save bar on mobile — the confirm action is never off-screen. */}
      <div className="fixed inset-x-0 bottom-[4.5rem] z-20 border-t border-ink-200 bg-white/95 p-3 backdrop-blur lg:hidden print-hide">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <Button variant="secondary" className="flex-1" onClick={saveAndPreview} disabled={saving}>
            <Eye /> Preview
          </Button>
          <Button className="flex-1" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </div>

      <PriceBookPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(source) =>
          updateItems([...items, priceBookItemToQuoteItem(source, quote.id, items.length)])
        }
      />
    </div>
  )
}
