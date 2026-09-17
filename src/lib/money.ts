/**
 * Deterministic money maths.
 *
 * Product principle #4: every price and tax figure in QuoteFlow is computed
 * here, in plain application code. No AI model ever produces a total.
 *
 * All amounts are integer minor units (cents). Percentages are plain numbers
 * (25 means 25%). Rates are fractions (0.15 means 15%).
 */

import type { Quote, QuoteItem } from '@/types/domain'

/** Round half away from zero — the convention people expect on an invoice. */
export function roundToCents(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

/** Line total for a single item, in minor units. */
export function lineTotal(item: Pick<QuoteItem, 'quantity' | 'selling_price'>): number {
  return roundToCents(item.quantity * item.selling_price)
}

/** Apply a markup percentage to a cost to get a selling price. */
export function applyMarkup(cost: number, markupPercent: number): number {
  return roundToCents(cost * (1 + markupPercent / 100))
}

/** Derive the markup percentage implied by a cost/selling price pair. */
export function impliedMarkup(cost: number, sellingPrice: number): number | null {
  if (cost <= 0) return null
  return Math.round((sellingPrice / cost - 1) * 1000) / 10
}

export interface QuoteTotals {
  /** Tax-exclusive subtotal. */
  subtotal: number
  gst_amount: number
  /** Tax-inclusive total — what the customer pays. */
  total: number
}

/**
 * Totals for a set of line items.
 *
 * `gstInclusive` describes the prices that were *entered*:
 *  - false: entered prices exclude tax, so tax is added on top.
 *  - true:  entered prices already include tax, so tax is backed out of them.
 *
 * This is an explicit business setting (see product spec §2) — never inferred.
 */
export function calculateTotals(
  items: ReadonlyArray<Pick<QuoteItem, 'quantity' | 'selling_price'>>,
  gstInclusive: boolean,
  gstRate: number,
): QuoteTotals {
  const sum = items.reduce((acc, item) => acc + lineTotal(item), 0)

  if (gstInclusive) {
    const subtotal = roundToCents(sum / (1 + gstRate))
    // Derive tax by subtraction so subtotal + gst always equals the total the
    // customer was quoted, with no rounding drift on the visible number.
    return { subtotal, gst_amount: sum - subtotal, total: sum }
  }

  const gst = roundToCents(sum * gstRate)
  return { subtotal: sum, gst_amount: gst, total: sum + gst }
}

/** Returns a copy of the quote with its stored totals brought back in sync. */
export function recalculateQuote(
  quote: Quote,
  items: ReadonlyArray<Pick<QuoteItem, 'quantity' | 'selling_price'>>,
): Quote {
  return { ...quote, ...calculateTotals(items, quote.gst_inclusive, quote.gst_rate) }
}

/* ------------------------------------------------------------------ */
/* Formatting + parsing                                                */
/* ------------------------------------------------------------------ */

export function formatMoney(cents: number, currency = 'NZD', withSymbol = true): string {
  const formatter = new Intl.NumberFormat('en-NZ', {
    style: withSymbol ? 'currency' : 'decimal',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return formatter.format(cents / 100)
}

/** Plain "1234.50" for use inside editable inputs. */
export function centsToInput(cents: number | null): string {
  if (cents === null || Number.isNaN(cents)) return ''
  return (cents / 100).toFixed(2)
}

/** Parse user input into minor units. Returns null for blank/unparseable input. */
export function inputToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const parsed = Number.parseFloat(cleaned)
  if (Number.isNaN(parsed)) return null
  return roundToCents(parsed * 100)
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}
