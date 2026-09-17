/**
 * Quote numbers are sequential per business and human-readable: Q-2026-0042.
 * Generated in application code so the number a contractor reads out over the
 * phone is stable and predictable.
 */

const PREFIX = 'Q'

export function nextQuoteNumber(existing: ReadonlyArray<{ quote_number: string }>): string {
  const year = new Date().getFullYear()
  const pattern = new RegExp(`^${PREFIX}-${year}-(\\d+)$`)

  const highest = existing.reduce((max, quote) => {
    const match = pattern.exec(quote.quote_number)
    if (!match) return max
    return Math.max(max, Number.parseInt(match[1], 10))
  }, 0)

  return `${PREFIX}-${year}-${String(highest + 1).padStart(4, '0')}`
}
