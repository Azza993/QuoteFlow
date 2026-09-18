import { useEffect, useState } from 'react'
import { Database, Loader2, RotateCcw, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useData } from '@/hooks/use-data'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import type { BusinessProfile } from '@/types/domain'

export function Settings() {
  const { business, saveBusiness, backend, resetDemoData } = useData()
  const [draft, setDraft] = useState<BusinessProfile>(business)
  const [saving, setSaving] = useState(false)

  useEffect(() => setDraft(business), [business])

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
      <PageHeader title="Settings" subtitle="Your business details and the defaults every new quote starts from." />
      <div className="space-y-5">
        <Card className="border-brand-200">
          <CardHeader>
            <CardTitle>{draft.tax_label} handling</CardTitle>
            <CardDescription>
              This decides what the prices you type mean. Get it wrong and every quote is out by {Math.round(draft.gst_rate * 100)}%.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <TaxModeOption selected={!draft.gst_inclusive} title={`Prices exclude ${draft.tax_label}`} description={`You type $100, the customer pays $${(100 * (1 + draft.gst_rate)).toFixed(2)}.`} onSelect={() => set('gst_inclusive', false)} />
              <TaxModeOption selected={draft.gst_inclusive} title={`Prices include ${draft.tax_label}`} description={`You type $100, the customer pays $100.`} onSelect={() => set('gst_inclusive', true)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tax name" htmlFor="tax-label" hint="GST, VAT, Sales Tax…"><Input id="tax-label" value={draft.tax_label} onChange={(e) => set('tax_label', e.target.value)} /></Field>
              <Field label="Rate %" htmlFor="tax-rate"><Input id="tax-rate" inputMode="decimal" value={Math.round(draft.gst_rate * 10000) / 100} onChange={(e) => { const parsed = Number.parseFloat(e.target.value); set('gst_rate', Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 99) / 100) }} /></Field>
              <Field label="Currency" htmlFor="currency"><Input id="currency" value={draft.currency_code} onChange={(e) => set('currency_code', e.target.value.toUpperCase())} maxLength={3} /></Field>
            </div>
            <p className="rounded-xl bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
              Changing this only affects new quotes. Existing quotes keep the tax setting they were built with.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Business details</CardTitle><CardDescription>These appear at the top of every quote.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Business name" htmlFor="business-name"><Input id="business-name" value={draft.business_name} onChange={(e) => set('business_name', e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" htmlFor="business-phone"><Input id="business-phone" inputMode="tel" value={draft.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value || null)} /></Field>
              <Field label="Email" htmlFor="business-email"><Input id="business-email" inputMode="email" value={draft.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value || null)} /></Field>
            </div>
            <Field label="Address" htmlFor="business-address"><Input id="business-address" value={draft.address ?? ''} onChange={(e) => set('address', e.target.value || null)} /></Field>
            <Field label="Logo URL" htmlFor="logo" hint="Paste a link to your logo. File upload is coming later."><Input id="logo" value={draft.logo_url ?? ''} onChange={(e) => set('logo_url', e.target.value || null)} placeholder="https://…" /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quote defaults</CardTitle><CardDescription>Every new quote starts with these — change them per quote any time.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valid for (days)" htmlFor="validity"><Input id="validity" type="number" min="1" max="365" value={draft.default_validity_days} onChange={(e) => set('default_validity_days', Number.parseInt(e.target.value, 10) || 30)} /></Field>
              <Field label="Default material markup %" htmlFor="material-markup" hint="Applied automatically when you enter a cost on a Material line.">
                <Input id="material-markup" inputMode="decimal" min="0" max="1000" value={draft.default_material_markup} onChange={(e) => { const parsed = Number.parseFloat(e.target.value); set('default_material_markup', Number.isFinite(parsed) ? Math.max(parsed, 0) : 0) }} />
              </Field>
            </div>
            <Textarea id="terms" rows={5} value={draft.default_terms} onChange={(e) => set('default_terms', e.target.value)} aria-label="Default terms" placeholder="Default terms shown on every new quote." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-4 text-ink-400" />Data</CardTitle><CardDescription>{backend === 'demo' ? 'Running on demo data, saved in this browser.' : 'Connected to your Supabase project.'}</CardDescription></CardHeader>
          {backend === 'demo' ? <CardContent><AlertDialog><AlertDialogTrigger asChild><Button variant="secondary"><RotateCcw /> Reset demo data</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>Reset the demo data?</AlertDialogTitle><AlertDialogDescription>Every quote, customer and price book item goes back to how it started. Anything you've added will be lost.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel /><AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={async () => { await resetDemoData(); toast.success('Demo data restored.') }}>Reset everything</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></CardContent> : null}
        </Card>
      </div>
      <div className="mt-5 hidden md:block"><Button size="lg" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings</Button></div>
      <div className="fixed inset-x-0 bottom-[4.5rem] z-20 border-t border-ink-200 bg-white/95 p-3 backdrop-blur md:hidden"><Button size="lg" className="w-full" onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save settings</Button></div>
    </div>
  )
}

function TaxModeOption({ selected, title, description, onSelect }: { selected: boolean; title: string; description: string; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cn('rounded-xl border-2 p-4 text-left transition-colors', selected ? 'border-brand-500 bg-brand-50' : 'border-ink-200 bg-white hover:border-ink-300')}>
      <span className="flex items-center gap-2"><span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-brand-600 bg-brand-600' : 'border-ink-300')}>{selected ? <span className="size-1.5 rounded-full bg-white" /> : null}</span><span className="text-sm font-semibold text-ink-900">{title}</span></span>
      <span className="mt-1.5 block text-xs leading-relaxed text-ink-500">{description}</span>
    </button>
  )
}
