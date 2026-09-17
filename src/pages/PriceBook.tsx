import { useMemo, useState } from 'react'
import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/EmptyState'
import { Money } from '@/components/Money'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { TYPE_LABEL } from '@/components/LineItemEditor'
import { applyMarkup, centsToInput, impliedMarkup, inputToCents } from '@/lib/money'
import { newId } from '@/lib/utils'
import { LINE_ITEM_TYPES, type LineItemType, type PriceBookItem } from '@/types/domain'

export function PriceBook() {
  const { priceBook, business, savePriceBookItem, removePriceBookItem } = useData()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PriceBookItem | null>(null)

  const results = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return priceBook
      .filter((item) => !needle || item.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [priceBook, search])

  const blank = (): PriceBookItem => ({
    id: newId(),
    business_id: business.id,
    name: '',
    type: 'service',
    unit: 'each',
    cost: null,
    markup: null,
    selling_price: 0,
  })

  return (
    <div>
      <PageHeader
        title="Price book"
        subtitle="The things you quote over and over, ready to drop into any quote."
        actions={
          <Button onClick={() => setEditing(blank())}>
            <Plus /> Add item
          </Button>
        }
      />

      {priceBook.length > 0 ? (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your price book"
            className="pl-9"
            type="search"
            aria-label="Search the price book"
          />
        </div>
      ) : null}

      {results.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title={search ? 'No matching items' : 'Your price book is empty'}
          description={
            search
              ? 'Try a different word.'
              : 'Add the jobs and materials you quote regularly so you never have to look them up twice.'
          }
          action={
            <Button size="lg" onClick={() => setEditing(blank())}>
              <Plus /> Add your first item
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-card"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{item.name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                  <Badge tone="muted" className="py-0.5">
                    {TYPE_LABEL[item.type]}
                  </Badge>
                  per {item.unit}
                  {item.cost !== null ? (
                    <span>
                      cost <Money cents={item.cost} />
                      {item.markup !== null ? ` · ${item.markup}% markup` : ''}
                    </span>
                  ) : null}
                </p>
                <Money cents={item.selling_price} className="mt-2 block text-lg font-bold text-ink-900" />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(item)}
                  aria-label={`Edit ${item.name}`}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-red-600 hover:bg-red-50"
                  onClick={async () => {
                    await removePriceBookItem(item.id)
                    toast.success('Removed from your price book.')
                  }}
                  aria-label={`Delete ${item.name}`}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <PriceBookDialog
          item={editing}
          taxLabel={business.tax_label}
          onClose={() => setEditing(null)}
          onSave={async (item) => {
            await savePriceBookItem(item)
            setEditing(null)
            toast.success('Saved to your price book.')
          }}
        />
      ) : null}
    </div>
  )
}

function PriceBookDialog({
  item,
  taxLabel,
  onClose,
  onSave,
}: {
  item: PriceBookItem
  taxLabel: string
  onClose: () => void
  onSave: (item: PriceBookItem) => Promise<void>
}) {
  const [draft, setDraft] = useState(item)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof PriceBookItem>(key: K, value: PriceBookItem[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  // Cost + markup drive the selling price; typing a selling price back-fills
  // the markup. Both directions computed in code.
  const setCost = (raw: string) => {
    const cost = inputToCents(raw)
    setDraft((current) => ({
      ...current,
      cost,
      selling_price:
        cost !== null && current.markup !== null
          ? applyMarkup(cost, current.markup)
          : current.selling_price,
    }))
  }

  const setMarkup = (raw: string) => {
    const parsed = raw.trim() === '' ? null : Number.parseFloat(raw)
    const markup = parsed === null || Number.isNaN(parsed) ? null : parsed
    setDraft((current) => ({
      ...current,
      markup,
      selling_price:
        markup !== null && current.cost !== null
          ? applyMarkup(current.cost, markup)
          : current.selling_price,
    }))
  }

  const setSellingPrice = (raw: string) => {
    const selling_price = inputToCents(raw) ?? 0
    setDraft((current) => ({
      ...current,
      selling_price,
      markup:
        current.cost !== null && current.cost > 0
          ? impliedMarkup(current.cost, selling_price)
          : current.markup,
    }))
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.name ? 'Edit item' : 'New price book item'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name" htmlFor="pb-name">
            <Input
              id="pb-name"
              autoFocus
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="e.g. Double GPO — supply & install"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" htmlFor="pb-type">
              <Select
                id="pb-type"
                value={draft.type}
                onChange={(event) => set('type', event.target.value as LineItemType)}
              >
                {LINE_ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit" htmlFor="pb-unit">
              <Input
                id="pb-unit"
                value={draft.unit}
                onChange={(event) => set('unit', event.target.value)}
                placeholder="each"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Your cost (optional)" htmlFor="pb-cost">
              <Input
                id="pb-cost"
                inputMode="decimal"
                value={centsToInput(draft.cost)}
                onChange={(event) => setCost(event.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label="Markup %" htmlFor="pb-markup">
              <Input
                id="pb-markup"
                inputMode="decimal"
                value={draft.markup ?? ''}
                onChange={(event) => setMarkup(event.target.value)}
                placeholder="—"
              />
            </Field>
          </div>

          <Field
            label="Selling price"
            htmlFor="pb-price"
            hint={`Per ${draft.unit}. Whether this includes ${taxLabel} follows each quote's setting.`}
          >
            <Input
              id="pb-price"
              inputMode="decimal"
              value={centsToInput(draft.selling_price)}
              onChange={(event) => setSellingPrice(event.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!draft.name.trim() || saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave({ ...draft, name: draft.name.trim() })
              } finally {
                setSaving(false)
              }
            }}
          >
            Save item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
