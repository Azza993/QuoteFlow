import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  className,
}: {
  title: string
  subtitle?: ReactNode
  back?: { to: string; label?: string }
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-5', className)}>
      {back ? (
        <Link
          to={back.to}
          className="-ml-1.5 mb-2 inline-flex items-center gap-1 rounded-lg py-1 pl-1 pr-2 text-sm font-medium text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
        >
          <ChevronLeft className="size-4" />
          {back.label ?? 'Back'}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-[1.75rem]">
            {title}
          </h1>
          {subtitle ? <div className="mt-1 text-sm text-ink-500">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
