import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white px-6 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500">
          {icon}
        </div>
      ) : null}
      <p className="text-base font-semibold text-ink-900">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
