import { useMemo, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import type { PriceBookItem, QuoteItem } from '@/types/domain'
import { useData } from '@/hooks/use-data'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Money } from './Money'
import { EmptyState } from './EmptyState'
import { Badge } from './ui/badge'
import { newId } from '@/lib/utils'
import { TYPE_LABEL } from './LineItemEditor'

/** Turns a saved price book entry into a line on this quote. */
export function priceBookItemToQuoteItem(
  source: PriceBookItem,
  quoteId: string,
  sortOrder: number,
): QuoteItem {
  return {
    id: newId(),
    quote_id: quoteId,
    description: source.name,
    quantity: 1,
    unit: source.unit,
    cost: source.cost,
    markup: source.markup,
    selling_price: source.selling_price,
    type: source.type,
    notes: null,
    sort_order: sortOrder,
  }
}

export function PriceBookPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (item: PriceBookItem) => void
}) {
  const { priceBook } = useData()
  const [search, setSearch] = useState('')

  const results = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return priceBook
      .filter((item) => !needle || item.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [priceBook, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add from price book</DialogTitle>
          <DialogDescription>
            Tap an item to add it to this quote. You can change the quantity and price afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your price book"
            className="pl-9"
            aria-label="Search the price book"
          />
        </div>

        {results.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title={search ? 'No matching items' : 'Your price book is empty'}
            description={
              search
                ? 'Try a different word, or add the line by hand instead.'
                : 'Add the things you quote regularly and they will show up here.'
            }
            className="border-none shadow-none"
          />
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(item)
                    onOpenChange(false)
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">{item.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                      <Badge tone="muted" className="py-0.5">
                        {TYPE_LABEL[item.type]}
                      </Badge>
                      per {item.unit}
                    </p>
                  </div>
                  <Money cents={item.selling_price} className="shrink-0 font-semibold text-ink-900" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
