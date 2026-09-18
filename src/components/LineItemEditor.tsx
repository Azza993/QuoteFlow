import { useState } from 'react'
import { ChevronDown, GripVertical, Trash2 } from 'lucide-react'
import type { LineItemType, QuoteItem } from '@/types/domain'
import { LINE_ITEM_TYPES } from '@/types/domain'
import { Input, Select, Textarea } from './ui/input'
import { Button } from './ui/button'
import { Label } from './ui/label'
import { Money } from './Money'
import { applyMarkup, centsToInput, impliedMarkup, inputToCents, lineTotal } from '@/lib/money'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<LineItemType, string> = {
  service: 'Service',
  material: 'Material',
  allowance: 'Allowance',
  other: 'Other',
}

const UNITS = ['each', 'hour', 'day', 'm', 'm²', 'lm', 'point', 'lot']

export function LineItemEditor({
  item,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  item: QuoteItem
  index: number
  total: number
  onChange: (next: QuoteItem) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
}) {
  // Cost and markup are optional — plenty of contractors price straight off
  // experience — so they stay tucked away until asked for.
  const [showCosting, setShowCosting] = useState(item.cost !== null || item.markup !== null)

  const set = <K extends keyof QuoteItem>(key: K, value: QuoteItem[K]) =>
    onChange({ ...item, [key]: value })

  /** Changing the cost or markup recalculates the selling price, in code. */
  const setCost = (raw: string) => {
    const cost = inputToCents(raw)
    const next = { ...item, cost }
    if (cost !== null && item.markup !== null) next.selling_price = applyMarkup(cost, item.markup)
    onChange(next)
  }

  const setMarkup = (raw: string) => {
    const parsed = raw.trim() === '' ? null : Number.parseFloat(raw)
    const markup = parsed === null || Number.isNaN(parsed) ? null : parsed
    const next = { ...item, markup }
    if (markup !== null && item.cost !== null) next.selling_price = applyMarkup(item.cost, markup)
    onChange(next)
  }

  /** Typing a selling price directly keeps the markup honest. */
  const setSellingPrice = (raw: string) => {
    const selling_price = inputToCents(raw) ?? 0
    const next = { ...item, selling_price }
    if (item.cost !== null && item.cost > 0) next.markup = impliedMarkup(item.cost, selling_price)
    onChange(next)
  }

  return (
    <li className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink-100 text-xs font-semibold text-ink-600">
          {index + 1}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move item up"
          >
            <GripVertical className="rotate-90" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rotate-180"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move item down"
          >
            <GripVertical className="rotate-90" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-red-600 hover:bg-red-50"
            onClick={onRemove}
            aria-label={`Remove item ${index + 1}`}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`desc-${item.id}`}>Description</Label>
          <Input
            id={`desc-${item.id}`}
            value={item.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="e.g. Switchboard upgrade — 8 way with RCDs"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`qty-${item.id}`}>Qty</Label>
            <QuantityInput
              id={`qty-${item.id}`}
              value={item.quantity}
              onChange={(quantity) => set('quantity', quantity)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`unit-${item.id}`}>Unit</Label>
            <Select
              id={`unit-${item.id}`}
              value={UNITS.includes(item.unit) ? item.unit : 'each'}
              onChange={(event) => set('unit', event.target.value)}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`price-${item.id}`}>Price each</Label>
            <MoneyInput
              id={`price-${item.id}`}
              value={item.selling_price}
              onChange={setSellingPrice}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`type-${item.id}`}>Type</Label>
            <Select
              id={`type-${item.id}`}
              value={item.type}
              onChange={(event) => set('type', event.target.value as LineItemType)}
            >
              {LINE_ITEM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-50 px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => setShowCosting((open) => !open)}
            className="inline-flex items-center gap-1 text-sm font-medium text-ink-600 hover:text-ink-900"
            aria-expanded={showCosting}
          >
            Cost &amp; markup
            <ChevronDown className={cn('size-4 transition-transform', showCosting && 'rotate-180')} />
          </button>
          <p className="text-sm text-ink-500">
            Line total <Money cents={lineTotal(item)} className="font-semibold text-ink-900" />
          </p>
        </div>

        {showCosting ? (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-dashed border-ink-200 p-3.5">
            <div className="space-y-1.5">
              <Label htmlFor={`cost-${item.id}`}>Your cost (optional)</Label>
              <MoneyInput
                id={`cost-${item.id}`}
                value={item.cost}
                onChange={setCost}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`markup-${item.id}`}>Markup %</Label>
              <Input
                id={`markup-${item.id}`}
                inputMode="decimal"
                value={item.markup ?? ''}
                onChange={(event) => setMarkup(event.target.value)}
                placeholder="—"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor={`notes-${item.id}`}>Notes (shown on the quote)</Label>
              <Textarea
                id={`notes-${item.id}`}
                value={item.notes ?? ''}
                onChange={(event) => set('notes', event.target.value || null)}
                rows={2}
                placeholder="Anything the customer should know about this line."
                className="min-h-[60px]"
              />
            </div>
            <p className="col-span-2 text-xs text-ink-500">
              Cost and markup are yours only — they never appear on the customer's quote.
            </p>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function QuantityInput({
  value,
  onChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(() => String(value))

  const handleChange = (raw: string) => {
    // Keep the text editable while typing, including decimals. Normalise
    // leading zeroes so iOS cannot turn a starting 0 into values such as "020".
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const [whole, ...decimalParts] = cleaned.split('.')
    const normalisedWhole = whole.replace(/^0+(?=\d)/, '') || (cleaned.includes('.') ? '0' : '')
    const normalised = decimalParts.length > 0
      ? `${normalisedWhole}.${decimalParts.join('')}`
      : normalisedWhole

    setDraft(normalised)

    if (normalised !== '' && normalised !== '.') {
      const parsed = Number.parseFloat(normalised)
      if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed)
    } else {
      onChange(0)
    }
  }

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (draft === '0') event.currentTarget.select()
  }

  const handleBlur = () => {
    const parsed = Number.parseFloat(draft)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(String(value))
      return
    }
    setDraft(String(parsed))
    onChange(parsed)
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      min="0"
      step="0.25"
      value={draft}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(event) => handleChange(event.target.value)}
      aria-label="Quantity"
    />
  )
}

function MoneyInput({
  value,
  onChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null
  onChange: (value: string) => void
}) {
  const [draft, setDraft] = useState(() => centsToInput(value))

  const handleChange = (raw: string) => {
    // Keep a local string while editing. Updating the parent on every keystroke
    // is fine, but the rendered value must not come back from centsToInput(),
    // otherwise iOS loses the caret and repeated taps can appear to increment
    // the same digit instead of inserting a new one.
    const cleaned = raw.replace(/[^0-9.]/g, '')
    const [whole, ...decimalParts] = cleaned.split('.')
    const normalisedWhole = whole.replace(/^0+(?=\d)/, '') || (cleaned.includes('.') ? '0' : '')
    const normalised = decimalParts.length > 0
      ? `${normalisedWhole}.${decimalParts.join('')}`
      : normalisedWhole

    setDraft(normalised)
    onChange(normalised)
  }

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (draft === '0.00' || draft === '') event.currentTarget.select()
  }

  const handleBlur = () => {
    const cents = inputToCents(draft)
    setDraft(centsToInput(cents ?? 0))
    onChange(draft)
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={(event) => handleChange(event.target.value)}
    />
  )
}

export { TYPE_LABEL }
