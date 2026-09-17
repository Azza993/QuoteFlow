/**
 * Follow-up scheduling.
 *
 * When a quote is sent we lay down a small cadence of reminders. Nothing is
 * ever sent automatically (spec §8) — these only decide when the dashboard
 * nudges the contractor.
 */

import type { FollowUp, Quote } from '@/types/domain'
import { isoDaysFromNow } from './dates'
import { newId } from './utils'

/** Days after sending at which the contractor gets nudged. */
export const FOLLOW_UP_CADENCE_DAYS = [3, 7, 14]

export function buildFollowUpSchedule(quote: Quote, customerName: string): FollowUp[] {
  return FOLLOW_UP_CADENCE_DAYS.map((days, index) => ({
    id: newId(),
    quote_id: quote.id,
    scheduled_for: isoDaysFromNow(days),
    status: 'pending' as const,
    draft_message: index === 0 ? draftFollowUpMessage(quote, customerName, index) : null,
    sent_manually_at: null,
  }))
}

/**
 * A starting point for the follow-up note. The contractor always edits and
 * sends this themselves — see `src/ai/draft-message.ts` for the AI-assisted
 * version used on the quote detail screen.
 */
export function draftFollowUpMessage(quote: Quote, customerName: string, attempt = 0): string {
  const firstName = customerName.split(' ')[0] || 'there'
  const scope = quote.scope_summary ? ` for ${lowerFirst(quote.scope_summary)}` : ''

  if (attempt === 0) {
    return `Hi ${firstName}, just checking you received quote ${quote.quote_number}${scope}. Happy to walk you through anything in it — give me a call when you get a chance.`
  }
  if (attempt === 1) {
    return `Hi ${firstName}, following up on quote ${quote.quote_number}${scope}. Let me know if you'd like any changes to the scope or pricing and I can revise it.`
  }
  return `Hi ${firstName}, last check-in on quote ${quote.quote_number}${scope} before it expires. If the timing isn't right just let me know and I'll close it off.`
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}
