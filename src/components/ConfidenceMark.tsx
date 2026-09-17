import { AlertTriangle, Check, HelpCircle } from 'lucide-react'
import { NEEDS_REVIEW_THRESHOLD } from '@/types/domain'
import { cn } from '@/lib/utils'

export type ConfidenceLevel = 'good' | 'check' | 'missing'

export function confidenceLevel(confidence: number, hasValue: boolean): ConfidenceLevel {
  if (!hasValue) return 'missing'
  return confidence >= NEEDS_REVIEW_THRESHOLD ? 'good' : 'check'
}

const COPY: Record<ConfidenceLevel, { label: string; className: string }> = {
  good: { label: 'Read clearly', className: 'text-brand-600' },
  check: { label: 'Needs a check', className: 'text-amber-600' },
  missing: { label: 'Not found', className: 'text-ink-400' },
}

/** Small inline indicator on an extracted field. */
export function ConfidenceMark({
  level,
  withLabel = false,
  className,
}: {
  level: ConfidenceLevel
  withLabel?: boolean
  className?: string
}) {
  const { label, className: tone } = COPY[level]
  const Icon = level === 'good' ? Check : level === 'check' ? AlertTriangle : HelpCircle

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', tone, className)}>
      <Icon className="size-3.5" aria-hidden />
      {withLabel ? label : <span className="sr-only">{label}</span>}
    </span>
  )
}
