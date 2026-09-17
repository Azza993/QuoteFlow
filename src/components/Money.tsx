import { formatMoney } from '@/lib/money'
import { useData } from '@/hooks/use-data'
import { cn } from '@/lib/utils'

/**
 * Renders an amount in the business's currency. Tabular numerals so columns of
 * figures line up on a quote.
 */
export function Money({
  cents,
  className,
  currency,
}: {
  cents: number
  className?: string
  currency?: string
}) {
  const { business } = useData()
  return (
    <span className={cn('tabular-nums', className)}>
      {formatMoney(cents, currency ?? business.currency_code ?? 'NZD')}
    </span>
  )
}
