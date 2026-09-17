# QuoteFlow

A mobile-first quoting app for trades and field-service businesses. Photograph
your handwritten site notes, turn them into a professional quote, and chase it
until it's accepted or declined.

It is deliberately small. It does not do accounting, payroll, scheduling,
inventory, fleet, project management, takeoffs, or CRM — just notes → quote →
follow-up.

## Running it

```bash
npm install
npm run dev
```

That's it. QuoteFlow boots on a realistic demo dataset (a Wellington
electrician with quotes across every status, overdue follow-ups, a price book
and a set of scanned notes), held in `localStorage`. No account, no database,
no configuration.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and build for production |
| `npm test` | Unit tests for the money engine and the quote lifecycle |
| `npm run preview` | Serve the production build |

## Two things worth knowing up front

**Numbers are never AI output.** The extractor reads handwriting; it never
invents or calculates a value. Every subtotal, tax figure and total is computed
in `src/lib/money.ts` — plain, tested, deterministic application code — from
line items a human has confirmed. A price the model reads off a page is a
`price_guess` and stays out of every total until it's confirmed on the Review
screen.

**Tax handling is explicit, never inferred.** Whether the prices you type
include or exclude GST is a business setting with its own card in Settings,
stating the consequence in plain words. Each quote snapshots that setting when
it's created, so changing the default later can never silently re-price a quote
you've already sent. The rate and label are data (`gst_rate`, `tax_label`), so
another region's tax model drops in without a migration.

## The flow

1. **Dashboard** — quotes by status, a follow-ups-due count, and a sent-vs-accepted rate.
2. **New quote** — *Scan notes* (the hero path) or *Start manually*.
3. **Scan** — one or more photos → extraction → Review.
4. **Review** — every field editable, uncertain ones flagged, and tapping any
   value shows the exact crop of the photo it was read from.
5. **Builder** — customer, site, scope and line items; totals recompute live.
6. **Preview** — what the customer sees, print/PDF, and a send dialog with a
   copyable link and message.
7. **Send** — marks the quote sent and lays down a follow-up schedule (3, 7 and
   14 days).
8. **Follow up** — the dashboard surfaces what's due; each one opens an
   editable draft. Nothing is ever sent automatically.

A **job** is created only when a quote is accepted, snapshotting the customer,
site and scope at that moment. Declined and expired quotes never create one.

## How it's put together

```
src/
  lib/money.ts          Deterministic pricing and tax. Tested.
  lib/follow-ups.ts     Follow-up cadence and draft wording.
  types/domain.ts       The data model, including the extraction shapes.
  data/
    repository.ts       Persistence interface — the only thing the app talks to.
    actions.ts          Business rules (lifecycle, job creation, de-duplication). Tested.
    DataProvider.tsx    Loads one snapshot, mutates through the repository.
    demo/               Seeded dataset + localStorage adapter (the default).
    supabase/           Supabase adapter (code-split; only loaded when configured).
  ai/
    extraction.ts       The NoteExtractor interface — the stable seam.
    mock-extractor.ts   Demo extractor, with realistic low-confidence fields.
    edge-extractor.ts   Calls the Supabase edge function.
  pages/                One file per screen.
supabase/
  migrations/           Schema, RLS, and the public accept/decline functions.
  seed.sql              The same demo data, for a real project.
  functions/extract-notes/   The real multimodal extraction call.
```

Business rules live *above* the persistence layer, so the demo and Supabase
backends behave identically.

### The extraction seam

`NoteExtractor` is the interface everything depends on:

```ts
interface NoteExtractor {
  extract(input: ExtractionInput): Promise<ExtractionOutcome>
}
```

Every extracted field arrives as `{ value, confidence, source_image_index,
source_bbox }` — which is what powers both the needs-review flags and the
photo-crop traceability. Partial extraction is always a success: unreadable
input comes back as a low-confidence or null field with a note, never an error
that loses the photos. Swapping the model behind this interface requires no UI
changes.

## Connecting a real Supabase project

The app uses Supabase as soon as both variables are set, and the demo backend
otherwise:

```bash
cp .env.example .env
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=...
```

Then apply the schema and seed:

```bash
supabase db reset          # runs migrations/ then seed.sql
```

For real note extraction, deploy the edge function and give it a key:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy extract-notes
```

The model call is server-side so the API key never reaches a phone browser.
Without it the app falls back to the demo extractor, which returns the same
shape.

### Customer-facing links

`/q/:token` is the quote a customer opens — no app shell, no sign-in, just the
quote and Accept/Decline. On Supabase it's served by two security-definer
functions (`public_quote`, `decide_public_quote`) rather than a permissive RLS
policy, so an anonymous visitor can read exactly one quote by unguessable token
and can't enumerate the table. Only a quote still awaiting a response can be
decided, so a link passed around can't flip one that's already settled.

## Not in this version

Deferred deliberately, not forgotten: an offline photo queue for poor-signal
sites, payment details on the template, automated follow-up sending, real email
delivery, supplier price imports, and a native app.
