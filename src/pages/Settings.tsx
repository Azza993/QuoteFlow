import { useEffect, useState } from 'react'
import { Database, Loader2, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { BusinessProfile } from '@/types/domain'

export function Settings() {
  const { business, saveBusiness, backend, resetDemoData } = useData()
  const [draft, setDraft] = useState<BusinessProfile>(business)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(business)
  }, [business])

  const set = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const save = async () => {
    setSaving(true)
    try {
      await saveBusiness(draft)
      toast.success('Settings saved.')
    } catch {
      toast.error("Couldn't save your settings.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-24 md:pb-0">
      <PageHeader
        title="Settings"
        subtitle="Your business details and the defaults every new quote starts from."
      />

      <div className="space-y-5">
        {/*
          GST inclusive-vs-exclusive is the one setting that silently changes
          every number on every quote, so it gets its own card at the top and
          states the consequence in plain words. It is never inferred.
        */}
        <Card className="border-brand-200">
          <CardHeader>
            <CardTitle>{draft.tax_label} handling</CardTitle>
            <CardDescription>
              This decides what the prices you type mean. Get it wrong and every quote is out by{' '}
              {Math.round(draft.gst_rate * 100)}%.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TaxModeOption
                selected={!draft.gst_inclusive}
                title={`Prices exclude ${draft.tax_label}`}
                description={`You type $100, the customer pays $${(100 * (1 + draft.gst_rate)).toFixed(2)}.`}
                onSelect={() => set('gst_inclusive', false)}
              />
              <TaxModeOption
                selected={draft.gst_inclusive}
                title={`Prices include ${draft.tax_label}`}
                description={`You type $100, the customer pays $100.`}
                onSelect={() => set('gst_inclusive', true)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tax name" htmlFor="tax-label" hint="GST, VAT, Sales Tax…">
                <Input
                  id="tax-label"
                  value={draft.tax_label}
                  onChange={(event) => set('tax_label', event.target.value)}
                />
              </Field>
              <Field label="Rate %" htmlFor="tax-rate">
                <Input
                  id="tax-rate"
                  inputMode="decimal"
                  value={Math.round(draft.gst_rate * 10000) / 100}
                  onChange={(event) => {
                    const parsed = Number.parseFloat(event.target.value)
                    set('gst_rate', Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 99) / 100)
                  }}
                />
              </Field>
              <Field label="Currency" htmlFor="currency">
                <Input
                  id="currency"
                  value={draft.currency_code}
                  onChange={(event) => set('currency_code', event.target.value.toUpperCase())}
                  maxLength={3}
                />
              </Field>
            </div>

            <p className="rounded-xl bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
              Changing this only affects new quotes. Quotes you've already made keep the setting
              they were built with, so nothing you've sent quietly changes price.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Business details</CardTitle>
            <CardDescription>These appear at the top of every quote.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Business name" htmlFor="business-name">
              <Input
                id="business-name"
                value={draft.business_name}
                onChange={(event) => set('business_name', event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="business-phone">
                <Input
                  id="business-phone"
                  inputMode="tel"
                  value={draft.contact_phone ?? ''}
                  onChange={(event) => set('contact_phone', event.target.value || null)}
                />
              </Field>
              <Field label="Email" htmlFor="business-email">
                <Input
                  id="business-email"
                  inputMode="email"
                  value={draft.contact_email ?? ''}
                  onChange={(event) => set('contact_email', event.target.value || null)}
                />
              </Field>
            </div>

            <Field label="Address" htmlFor="business-address">
              <Input
                id="business-address"
                value={draft.address ?? ''}
                onChange={(event) => set('address', event.target.value || null)}
              />
            </Field>

            <Field
              label="Logo URL"
              htmlFor="logo"
              hint="Paste a link to your logo. File upload is coming later."
            >
              <Input
                id="logo"
                value={draft.logo_url ?? ''}
                onChange={(event) => set('logo_url', event.target.value || null)}
                placeholder="https://…"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quote defaults</CardTitle>
            <CardDescription>Every new quote starts with these — change them per quote any time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Valid for (days)" htmlFor="validity">
              <Input
                id="validity"
                type="number"
                min="1"
                max="365"
                value={draft.default_validity_days}
                onChange={(event) =>
                  set('default_validity_days', Number.parseInt(event.target.value, 10) || 30)
                }
              />
            </Field>

            <Field label="Default terms" htmlFor="terms">
              <Textarea
                id="terms"
                rows={5}
                value={draft.default_terms}
                onChange={(event) => set('default_terms', event.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-ink-400" />
              Data
            </CardTitle>
            <CardDescription>
              {backend === 'demo'
                ? 'Running on demo data, saved in this browser. Add Supabase credentials to switch to a real database.'
                : 'Connected to your Supabase project.'}
            </CardDescription>
          </CardHeader>
          {backend === 'demo' ? (
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary">
                    <RotateCcw /> Reset demo data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle>Reset the demo data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Every quote, customer and price book item goes back to how it started. Anything
                    you've added will be lost.
                  </AlertDialogDescription>
                  <AlertDialogFooter>
                    <AlertDialogCancel />
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={async () => {
                        await resetDemoData()
                        toast.success('Demo data restored.')
                      }}
                    >
                      Reset everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          ) : null}
        </Card>
      </div>

      <div className="mt-5 hidden md:block">
        <Button size="lg" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-[4.5rem] z-20 border-t border-ink-200 bg-white/95 p-3 backdrop-blur md:hidden">
        <Button size="lg" className="w-full" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings
        </Button>
      </div>
    </div>
  )
}

function TaxModeOption({
  selected,
  title,
  description,
  onSelect,
}: {
  selected: boolean
  title: string
  description: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-xl border-2 p-4 text-left transition-colors',
        selected
          ? 'border-brand-500 bg-brand-50'
          : 'border-ink-200 bg-white hover:border-ink-300',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'flex size-4 shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-brand-600 bg-brand-600' : 'border-ink-300',
          )}
        >
          {selected ? <span className="size-1.5 rounded-full bg-white" /> : null}
        </span>
        <span className="text-sm font-semibold text-ink-900">{title}</span>
      </span>
      <span className="mt-1.5 block text-xs leading-relaxed text-ink-500">{description}</span>
    </button>
  )
}
