/**
 * Follow-up message drafting.
 *
 * The draft is a starting point only — it is always shown in an editable box
 * and nothing is ever sent without the contractor pressing send (spec §8).
 */

import type { Customer, Quote } from '@/types/domain'
import { daysUntil } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

export interface DraftContext {
  quote: Quote
  customer: Customer | null
  businessName: string
  senderName?: string
  /** How many follow-ups have already gone out on this quote. */
  attempt: number
}

export function draftFollowUp({ quote, customer, businessName, attempt }: DraftContext): string {
  const firstName = (customer?.name ?? '').split(' ')[0] || 'there'
  const scope = quote.scope_summary ? ` for ${lowerFirst(quote.scope_summary)}` : ''
  const value = formatMoney(quote.total, 'NZD')
  const daysLeft = quote.valid_until ? daysUntil(quote.valid_until) : null

  const expiryLine =
    daysLeft !== null && daysLeft >= 0 && daysLeft <= 10
      ? ` The quote's valid for another ${daysLeft === 0 ? 'day' : `${daysLeft} days`}, so let me know if you'd like me to extend it.`
      : ''

  const opener =
    attempt === 0
      ? `Just checking you got quote ${quote.quote_number}${scope} — ${value} all up.`
      : attempt === 1
        ? `Following up on quote ${quote.quote_number}${scope}, ${value}.`
        : `Last check-in on quote ${quote.quote_number}${scope}.`

  const closer =
    attempt === 0
      ? `Happy to talk through anything in it.`
      : attempt === 1
        ? `If the scope or the price needs adjusting, say the word and I'll revise it.`
        : `If the timing isn't right, no problem at all — just let me know and I'll close it off.`

  return `Hi ${firstName},\n\n${opener}${expiryLine} ${closer}\n\nCheers,\n${businessName}`
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
