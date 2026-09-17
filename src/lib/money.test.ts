import { describe, expect, it } from 'vitest'
import {
  applyMarkup,
  calculateTotals,
  centsToInput,
  impliedMarkup,
  inputToCents,
  lineTotal,
} from './money'

const item = (quantity: number, selling_price: number) => ({ quantity, selling_price })

describe('lineTotal', () => {
  it('multiplies quantity by unit price in cents', () => {
    expect(lineTotal(item(3, 4500))).toBe(13500)
  })

  it('rounds fractional quantities to whole cents', () => {
    expect(lineTotal(item(2.5, 999))).toBe(2498) // 2497.5 -> 2498
  })
})

describe('calculateTotals — GST exclusive', () => {
  it('adds tax on top of the entered prices', () => {
    const totals = calculateTotals([item(1, 10000), item(2, 5000)], false, 0.15)
    expect(totals).toEqual({ subtotal: 20000, gst_amount: 3000, total: 23000 })
  })

  it('rounds the tax line to the nearest cent', () => {
    const totals = calculateTotals([item(1, 3333)], false, 0.15)
    expect(totals).toEqual({ subtotal: 3333, gst_amount: 500, total: 3833 }) // 499.95 -> 500
  })
})

describe('calculateTotals — GST inclusive', () => {
  it('backs tax out of the entered prices', () => {
    const totals = calculateTotals([item(1, 11500)], true, 0.15)
    expect(totals).toEqual({ subtotal: 10000, gst_amount: 1500, total: 11500 })
  })

  it('never drifts: subtotal + gst always equals the quoted total', () => {
    for (let price = 1; price < 4000; price += 7) {
      const totals = calculateTotals([item(1, price)], true, 0.15)
      expect(totals.subtotal + totals.gst_amount).toBe(totals.total)
      expect(totals.total).toBe(price)
    }
  })
})

describe('calculateTotals — region independence', () => {
  it('works with a non-NZ rate', () => {
    expect(calculateTotals([item(1, 10000)], false, 0.2)).toEqual({
      subtotal: 10000,
      gst_amount: 2000,
      total: 12000,
    })
  })

  it('handles a zero rate', () => {
    expect(calculateTotals([item(1, 10000)], true, 0)).toEqual({
      subtotal: 10000,
      gst_amount: 0,
      total: 10000,
    })
  })

  it('returns zeroes for an empty quote', () => {
    expect(calculateTotals([], false, 0.15)).toEqual({ subtotal: 0, gst_amount: 0, total: 0 })
  })
})

describe('markup', () => {
  it('applies a percentage markup to a cost', () => {
    expect(applyMarkup(10000, 25)).toBe(12500)
  })

  it('rounds to whole cents', () => {
    expect(applyMarkup(999, 33)).toBe(1329) // 1328.67 -> 1329
  })

  it('derives the markup implied by a cost and selling price', () => {
    expect(impliedMarkup(10000, 12500)).toBe(25)
  })

  it('has no implied markup without a cost', () => {
    expect(impliedMarkup(0, 12500)).toBeNull()
  })
})

describe('input parsing', () => {
  it('round-trips through the editable input format', () => {
    expect(inputToCents(centsToInput(123456))).toBe(123456)
  })

  it('tolerates currency symbols and separators', () => {
    expect(inputToCents('$1,234.50')).toBe(123450)
  })

  it('treats blank input as absent rather than zero', () => {
    expect(inputToCents('')).toBeNull()
    expect(centsToInput(null)).toBe('')
  })
})
