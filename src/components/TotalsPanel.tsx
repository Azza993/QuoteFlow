import type { QuoteItem } from '@/types/domain'
import { calculateTotals } from '@/lib/money'
import { Money } from './Money'
import { cn } from '@/lib/utils'

/**
 * The totals block. Every figure here comes from `calculateTotals` — plain
 * application code, run on the current line items. Nothing is ever typed in
 * or supplied by the extractor.
 */
export function TotalsPanel({
  items,
  gstInclusive,
  gstRate,
  taxLabel,
  className,
}: {
  items: ReadonlyArray<Pick<QuoteItem, 'quantity' | 'selling_price'>>
  gstInclusive: boolean
  gstRate: number
  taxLabel: string
  className?: string
}) {
  const totals = calculateTotals(items, gstInclusive, gstRate)
  const ratePercent = Math.round(gstRate * 1000) / 10

  return (
    <div className={cn('rounded-2xl border border-ink-200 bg-white p-5 shadow-card', className)}>
      <dl className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-ink-500">Subtotal</dt>
          <dd>
            <Money cents={totals.subtotal} className="font-medium text-ink-900" />
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-ink-500">
            {taxLabel} ({ratePercent}%)
          </dt>
          <dd>
            <Money cents={totals.gst_amount} className="font-medium text-ink-900" />
          </dd>
        </div>
        <div className="flex items-center justify-between border-t border-ink-200 pt-3">
          <dt className="text-base font-semibold text-ink-900">Total</dt>
          <dd>
            <Money cents={totals.total} className="text-xl font-bold text-ink-900" />
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-ink-500">
        {gstInclusive
          ? `Prices entered include ${taxLabel}.`
          : `Prices entered exclude ${taxLabel}; it is added on top.`}
      </p>
    </div>
  )
}
