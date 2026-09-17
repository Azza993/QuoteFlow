import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Phone, Plus, Search, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { EmptyState } from '@/components/EmptyState'
import { Money } from '@/components/Money'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { findCustomerMatch } from '@/data/actions'
import { newId } from '@/lib/utils'
import { nowIso } from '@/lib/dates'
import type { Customer } from '@/types/domain'

export function Customers() {
  const { customers, quotes, business, saveCustomer, removeCustomer } = useData()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Customer | null>(null)

  const results = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return customers
      .filter((customer) =>
        !needle ||
        [customer.name, customer.phone, customer.email, customer.address].some((value) =>
          value?.toLowerCase().includes(needle),
        ),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [customers, search])

  const blank = (): Customer => ({
    id: newId(),
    business_id: business.id,
    name: '',
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: nowIso(),
  })

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} on your books`}
        actions={
          <Button onClick={() => setEditing(blank())}>
            <Plus /> Add customer
          </Button>
        }
      />

      {customers.length > 0 ? (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, phone or address"
            className="pl-9"
            type="search"
            aria-label="Search customers"
          />
        </div>
      ) : null}

      {results.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" />}
          title={search ? 'No matching customers' : 'No customers yet'}
          description={
            search
              ? 'Try a different name or number.'
              : 'Customers are added automatically when you make them a quote — or add one here.'
          }
          action={
            <Button size="lg" onClick={() => setEditing(blank())}>
              <Plus /> Add a customer
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.map((customer) => {
            const theirQuotes = quotes.filter((quote) => quote.customer_id === customer.id)
            const won = theirQuotes.filter((quote) => quote.status === 'accepted')

            return (
              <li
                key={customer.id}
                className="rounded-2xl border border-ink-200 bg-white p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setEditing(customer)}
                      className="text-left text-base font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {customer.name}
                    </button>
                    {customer.address ? (
                      <p className="mt-0.5 truncate text-xs text-ink-500">{customer.address}</p>
                    ) : null}
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-red-600 hover:bg-red-50"
                        aria-label={`Delete ${customer.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Their {theirQuotes.length} quote{theirQuotes.length === 1 ? '' : 's'} will
                        be kept, but will no longer be linked to a customer.
                      </AlertDialogDescription>
                      <AlertDialogFooter>
                        <AlertDialogCancel />
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={async () => {
                            await removeCustomer(customer.id)
                            toast.success('Customer deleted.')
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {customer.phone ? (
                    <a
                      href={`tel:${customer.phone}`}
                      className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"
                    >
                      <Phone className="size-3.5" />
                      {customer.phone}
                    </a>
                  ) : null}
                  {customer.email ? (
                    <a
                      href={`mailto:${customer.email}`}
                      className="inline-flex min-w-0 items-center gap-1.5 text-brand-700 hover:underline"
                    >
                      <Mail className="size-3.5 shrink-0" />
                      <span className="truncate">{customer.email}</span>
                    </a>
                  ) : null}
                </div>

                {customer.notes ? (
                  <p className="mt-2 text-xs italic leading-relaxed text-ink-500">
                    {customer.notes}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-ink-100 pt-3 text-xs text-ink-500">
                  <Link to={`/quotes?status=all`} className="hover:text-ink-800">
                    {theirQuotes.length} quote{theirQuotes.length === 1 ? '' : 's'}
                    {won.length > 0 ? ` · ${won.length} won` : ''}
                  </Link>
                  {won.length > 0 ? (
                    <Money
                      cents={won.reduce((sum, quote) => sum + quote.total, 0)}
                      className="font-semibold text-ink-700"
                    />
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing ? (
        <CustomerDialog
          customer={editing}
          existing={customers}
          onClose={() => setEditing(null)}
          onSave={async (customer) => {
            await saveCustomer(customer)
            setEditing(null)
            toast.success('Customer saved.')
          }}
        />
      ) : null}
    </div>
  )
}

function CustomerDialog({
  customer,
  existing,
  onClose,
  onSave,
}: {
  customer: Customer
  existing: Customer[]
  onClose: () => void
  onSave: (customer: Customer) => Promise<void>
}) {
  const [draft, setDraft] = useState(customer)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof Customer>(key: K, value: Customer[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  // Warn about a likely duplicate while they're still typing, not after.
  const duplicate = useMemo(() => {
    const match = findCustomerMatch(
      existing.filter((c) => c.id !== draft.id),
      draft.name,
      draft.phone,
    )
    return match
  }, [existing, draft.id, draft.name, draft.phone])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer.name ? 'Edit customer' : 'New customer'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Name" htmlFor="c-name">
            <Input
              id="c-name"
              autoFocus
              value={draft.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Full name or business name"
            />
          </Field>

          {duplicate ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
              You already have <strong>{duplicate.customer.name}</strong> with{' '}
              {duplicate.reason === 'phone' ? 'that phone number' : 'a very similar name'}. Is this
              the same person?
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" htmlFor="c-phone">
              <Input
                id="c-phone"
                inputMode="tel"
                value={draft.phone ?? ''}
                onChange={(event) => set('phone', event.target.value || null)}
              />
            </Field>
            <Field label="Email" htmlFor="c-email">
              <Input
                id="c-email"
                inputMode="email"
                value={draft.email ?? ''}
                onChange={(event) => set('email', event.target.value || null)}
              />
            </Field>
          </div>

          <Field label="Address" htmlFor="c-address">
            <Input
              id="c-address"
              value={draft.address ?? ''}
              onChange={(event) => set('address', event.target.value || null)}
            />
          </Field>

          <Field label="Notes" htmlFor="c-notes" hint="Only you see these.">
            <Textarea
              id="c-notes"
              rows={2}
              value={draft.notes ?? ''}
              onChange={(event) => set('notes', event.target.value || null)}
              placeholder="Access details, who to call, anything worth remembering."
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!draft.name.trim() || saving}
            onClick={async () => {
              setSaving(true)
              try {
                await onSave({ ...draft, name: draft.name.trim() })
              } finally {
                setSaving(false)
              }
            }}
          >
            Save customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
