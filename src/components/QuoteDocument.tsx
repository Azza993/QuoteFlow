import type { BusinessProfile, Customer, Quote, QuoteItem } from '@/types/domain'
import { calculateTotals, formatMoney, lineTotal } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/**
 * The quote as the customer sees it. Shared by the contractor's preview and
 * the public link so there is exactly one rendering of a quote — what you
 * preview is literally what they get.
 */
export function QuoteDocument({
  quote,
  items,
  customer,
  business,
  className,
}: {
  quote: Quote
  items: ReadonlyArray<QuoteItem>
  customer: Customer | null
  business: BusinessProfile
  className?: string
}) {
  const totals = calculateTotals(items, quote.gst_inclusive, quote.gst_rate)
  const currency = business.currency_code || 'NZD'
  const money = (cents: number) => formatMoney(cents, currency)
  const ratePercent = Math.round(quote.gst_rate * 1000) / 10

  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card print-full',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-ink-200 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            <img
              src={business.logo_url}
              alt={business.business_name}
              className="size-14 rounded-xl object-contain"
            />
          ) : (
            // Logo placeholder — upload comes later, but the layout already
            // reserves the space so quotes don't reflow when one is added.
            <div className="flex size-14 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
              {business.business_name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-lg font-bold text-ink-900">{business.business_name}</p>
            {business.address ? (
              <p className="text-xs text-ink-500">{business.address}</p>
            ) : null}
            <p className="text-xs text-ink-500">
              {[business.contact_phone, business.contact_email].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Quote</p>
          <p className="text-xl font-bold text-ink-900">{quote.quote_number}</p>
          <p className="mt-1 text-xs text-ink-500">
            Issued {formatDate(quote.sent_at ?? quote.created_at)}
          </p>
          {quote.valid_until ? (
            <p className="text-xs text-ink-500">Valid until {formatDate(quote.valid_until)}</p>
          ) : null}
        </div>
      </header>

      <section className="grid gap-5 border-b border-ink-200 p-6 sm:grid-cols-2 sm:p-8">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Prepared for</h2>
          <p className="mt-1.5 font-semibold text-ink-900">{customer?.name ?? '—'}</p>
          {customer?.phone ? <p className="text-sm text-ink-600">{customer.phone}</p> : null}
          {customer?.email ? <p className="text-sm text-ink-600">{customer.email}</p> : null}
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Site</h2>
          <p className="mt-1.5 text-sm text-ink-700">
            {quote.site_address ?? customer?.address ?? '—'}
          </p>
        </div>
      </section>

      {quote.scope_summary ? (
        <section className="border-b border-ink-200 p-6 sm:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Scope of work
          </h2>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
            {quote.scope_summary}
          </p>
        </section>
      ) : null}

      <section className="p-6 sm:p-8">
        <h2 className="sr-only">Line items</h2>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 px-4 py-6 text-center text-sm text-ink-500">
            No line items have been added yet.
          </p>
        ) : (
          <>
            {/* Stacked on a phone, tabular from `sm` up. */}
            <ul className="space-y-3 sm:hidden">
              {items.map((item) => (
                <li key={item.id} className="rounded-xl border border-ink-200 p-3.5">
                  <p className="text-sm font-semibold text-ink-900">{item.description}</p>
                  {item.notes ? (
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">{item.notes}</p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-ink-500">
                      {formatQuantity(item.quantity)} {item.unit} × {money(item.selling_price)}
                    </span>
                    <span className="font-semibold tabular-nums text-ink-900">
                      {money(lineTotal(item))}
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th scope="col" className="pb-2 font-semibold">Description</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Qty</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Unit price</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-ink-100 align-top">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-ink-900">{item.description}</p>
                      {item.notes ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{item.notes}</p>
                      ) : null}
                    </td>
                    <td className="py-3 text-right tabular-nums text-ink-600">
                      {formatQuantity(item.quantity)} {item.unit}
                    </td>
                    <td className="py-3 text-right tabular-nums text-ink-600">
                      {money(item.selling_price)}
                    </td>
                    <td className="py-3 text-right font-medium tabular-nums text-ink-900">
                      {money(lineTotal(item))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <dl className="ml-auto mt-5 max-w-xs space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-ink-500">Subtotal</dt>
            <dd className="tabular-nums text-ink-900">{money(totals.subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-ink-500">
              {business.tax_label} ({ratePercent}%)
            </dt>
            <dd className="tabular-nums text-ink-900">{money(totals.gst_amount)}</dd>
          </div>
          <div className="flex items-center justify-between border-t border-ink-200 pt-2.5">
            <dt className="font-semibold text-ink-900">Total</dt>
            <dd className="text-xl font-bold tabular-nums text-ink-900">{money(totals.total)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-right text-xs text-ink-500">
          All amounts in {currency}, {business.tax_label} inclusive of the total shown.
        </p>
      </section>

      {quote.terms ? (
        <footer className="border-t border-ink-200 bg-ink-50 p-6 sm:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Terms</h2>
          <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-ink-600">
            {quote.terms}
          </p>
        </footer>
      ) : null}
    </article>
  )
}

/** "1" not "1.000", but "2.5" survives. */
function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? String(quantity) : String(Number(quantity.toFixed(3)))
}
