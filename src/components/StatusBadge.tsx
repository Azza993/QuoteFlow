import { Badge } from './ui/badge'
import type { QuoteStatus } from '@/types/domain'
import { cn } from '@/lib/utils'

/** Customer-facing wording, not database wording. */
const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Awaiting response',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
}

const STATUS_TONE = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'success',
  declined: 'danger',
  expired: 'muted',
} as const

export function StatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      <span
        className={cn('size-1.5 rounded-full', {
          'bg-ink-400': status === 'draft' || status === 'expired',
          'bg-sky-500': status === 'sent',
          'bg-brand-500': status === 'accepted',
          'bg-red-500': status === 'declined',
        })}
      />
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export { STATUS_LABEL }
