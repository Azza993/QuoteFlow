/** Date helpers. Everything is stored as an ISO 8601 string. */

export function nowIso(): string {
  return new Date().toISOString()
}

export function addDays(date: Date | string, days: number): Date {
  const base = typeof date === 'string' ? new Date(date) : new Date(date.getTime())
  base.setDate(base.getDate() + days)
  return base
}

export function isoDaysFromNow(days: number): string {
  return addDays(new Date(), days).toISOString()
}

export function startOfDay(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  return d
}

/** Whole days from today to `date`. Negative means the date has passed. */
export function daysUntil(date: string | Date): number {
  const target = startOfDay(date).getTime()
  const today = startOfDay(new Date()).getTime()
  return Math.round((target - today) / 86_400_000)
}

export function isPast(date: string | null | undefined): boolean {
  if (!date) return false
  return daysUntil(date) < 0
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateShort(date: string | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

/** "today", "in 3 days", "5 days ago" — the phrasing a dashboard needs. */
export function relativeDay(date: string | null | undefined): string {
  if (!date) return '—'
  const days = daysUntil(date)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) return `in ${days} days`
  return `${Math.abs(days)} days ago`
}

/** Value for an <input type="date">. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromDateInput(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
