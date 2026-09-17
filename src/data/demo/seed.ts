/**
 * Realistic demo data for a small NZ electrical contractor.
 *
 * Dates are generated relative to "now" so the dashboard always shows a live
 * mix of overdue follow-ups, quotes awaiting a response, and recent wins.
 */

import type {
  BusinessProfile,
  Customer,
  ExtractionResult,
  FollowUp,
  Job,
  NoteScan,
  PriceBookItem,
  Quote,
  QuoteItem,
} from '@/types/domain'
import { calculateTotals } from '@/lib/money'
import { addDays } from '@/lib/dates'
import { draftFollowUpMessage } from '@/lib/follow-ups'
import type { Snapshot } from '../repository'

const BUSINESS_ID = 'biz_demo_0001'
const YEAR = new Date().getFullYear()

const ago = (days: number) => addDays(new Date(), -days).toISOString()
const ahead = (days: number) => addDays(new Date(), days).toISOString()

/* ------------------------------------------------------------------ */
/* Business                                                            */
/* ------------------------------------------------------------------ */

const business: BusinessProfile = {
  id: BUSINESS_ID,
  business_name: 'Harrow Electrical',
  logo_url: null,
  gst_inclusive: false,
  gst_rate: 0.15,
  tax_label: 'GST',
  currency_code: 'NZD',
  default_terms:
    'Payment due 14 days from invoice date. Quote covers the scope described above; variations will be quoted separately before work proceeds. Price subject to site access as discussed.',
  default_validity_days: 30,
  contact_email: 'jobs@harrowelectrical.co.nz',
  contact_phone: '021 338 0192',
  address: '12 Kaiwharawhara Road, Wellington 6035',
  created_at: ago(420),
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

const customer = (
  id: string,
  name: string,
  phone: string | null,
  email: string | null,
  address: string | null,
  notes: string | null,
  createdDaysAgo: number,
): Customer => ({
  id,
  business_id: BUSINESS_ID,
  name,
  phone,
  email,
  address,
  notes,
  created_at: ago(createdDaysAgo),
})

const customers: Customer[] = [
  customer('cust_priya', 'Priya Raman', '027 884 1120', 'priya.raman@gmail.com', '8 Thorndon Quay, Wellington', 'Repeat customer — rental portfolio, 3 properties.', 260),
  customer('cust_tane', 'Tane Ropata', '021 559 0043', 'tane.ropata@outlook.co.nz', '31 Owhiro Bay Parade, Wellington', null, 140),
  customer('cust_gemma', 'Gemma Clarke', '022 401 7789', 'gemma@clarkeandco.nz', '5 Aro Street, Wellington', 'Architect — refers work regularly. Worth chasing properly.', 95),
  customer('cust_sina', 'Sina Faleolo', '021 220 6614', 'sina@kowhaibakery.nz', '77 Riddiford Street, Newtown', 'Kōwhai Bakery. Fit-out work, after-hours access only.', 62),
  customer('cust_dave', 'Dave Mihaka', '027 118 2204', null, '19 Helston Road, Johnsonville', null, 48),
  customer('cust_marcus', 'Marcus Whiting', '021 447 8892', null, '14 Rimu Grove, Karori', 'Created from scanned site notes.', 2),
  customer('cust_alena', 'Alena Novak', '021 902 3341', 'alena.novak@proton.me', '4/60 Adelaide Road, Newtown', null, 9),
]

/* ------------------------------------------------------------------ */
/* Price book                                                          */
/* ------------------------------------------------------------------ */

const priceBook: PriceBookItem[] = [
  { id: 'pb_labour', business_id: BUSINESS_ID, name: 'Registered electrician — labour', type: 'service', unit: 'hour', cost: 6500, markup: 38.5, selling_price: 9000 },
  { id: 'pb_apprentice', business_id: BUSINESS_ID, name: 'Apprentice — labour', type: 'service', unit: 'hour', cost: 3200, markup: 40.6, selling_price: 4500 },
  { id: 'pb_callout', business_id: BUSINESS_ID, name: 'Callout / site visit', type: 'service', unit: 'each', cost: null, markup: null, selling_price: 9500 },
  { id: 'pb_downlight', business_id: BUSINESS_ID, name: 'LED downlight — dimmable, supply & install', type: 'material', unit: 'each', cost: 5200, markup: 63.5, selling_price: 8500 },
  { id: 'pb_gpo', business_id: BUSINESS_ID, name: 'Double GPO — supply & install', type: 'material', unit: 'each', cost: 6800, markup: 76.5, selling_price: 12000 },
  { id: 'pb_board8', business_id: BUSINESS_ID, name: 'Switchboard upgrade — 8 way with RCDs', type: 'material', unit: 'each', cost: 92000, markup: 57.6, selling_price: 145000 },
  { id: 'pb_circuit', business_id: BUSINESS_ID, name: 'New dedicated circuit', type: 'service', unit: 'each', cost: 38000, markup: 78.9, selling_price: 68000 },
  { id: 'pb_dishwasher', business_id: BUSINESS_ID, name: 'Appliance point (dishwasher / oven)', type: 'service', unit: 'each', cost: 14000, markup: 71.4, selling_price: 24000 },
  { id: 'pb_smoke', business_id: BUSINESS_ID, name: 'Photoelectric smoke alarm — 10yr', type: 'material', unit: 'each', cost: 4800, markup: 66.7, selling_price: 8000 },
  { id: 'pb_ev', business_id: BUSINESS_ID, name: 'EV charger install — 7kW single phase', type: 'material', unit: 'each', cost: 118000, markup: 55.9, selling_price: 184000 },
  { id: 'pb_gib', business_id: BUSINESS_ID, name: 'Gib repair allowance', type: 'allowance', unit: 'each', cost: null, markup: null, selling_price: 40000 },
  { id: 'pb_cert', business_id: BUSINESS_ID, name: 'Certificate of Compliance', type: 'other', unit: 'each', cost: null, markup: null, selling_price: 12000 },
]

/* ------------------------------------------------------------------ */
/* Quotes                                                              */
/* ------------------------------------------------------------------ */

interface QuoteSeed {
  quote: Omit<Quote, 'subtotal' | 'gst_amount' | 'total'>
  items: Array<Omit<QuoteItem, 'id' | 'quote_id' | 'sort_order'>>
}

const line = (
  description: string,
  quantity: number,
  unit: string,
  selling_price: number,
  type: QuoteItem['type'],
  extra: Partial<Pick<QuoteItem, 'cost' | 'markup' | 'notes'>> = {},
) => ({
  description,
  quantity,
  unit,
  selling_price,
  type,
  cost: extra.cost ?? null,
  markup: extra.markup ?? null,
  notes: extra.notes ?? null,
})

const seeds: QuoteSeed[] = [
  {
    quote: {
      id: 'quote_0037', business_id: BUSINESS_ID, customer_id: 'cust_priya', job_id: 'job_0037',
      quote_number: `Q-${YEAR}-0037`, status: 'accepted',
      site_address: '8 Thorndon Quay, Wellington',
      scope_summary: 'Switchboard upgrade and smoke alarm compliance across the ground floor flat.',
      gst_inclusive: false, gst_rate: 0.15,
      valid_until: ahead(9), terms: business.default_terms, source: 'manual',
      created_at: ago(38), sent_at: ago(37), decided_at: ago(31),
    },
    items: [
      line('Switchboard upgrade — 8 way with RCDs', 1, 'each', 145000, 'material', { cost: 92000, markup: 57.6 }),
      line('Registered electrician — labour', 6, 'hour', 9000, 'service', { cost: 6500, markup: 38.5 }),
      line('Photoelectric smoke alarm — 10yr', 4, 'each', 8000, 'material', { cost: 4800, markup: 66.7, notes: 'Bedrooms + hallway, hard-wired.' }),
      line('Certificate of Compliance', 1, 'each', 12000, 'other'),
    ],
  },
  {
    quote: {
      id: 'quote_0038', business_id: BUSINESS_ID, customer_id: 'cust_alena', job_id: 'job_0038',
      quote_number: `Q-${YEAR}-0038`, status: 'accepted',
      site_address: '4/60 Adelaide Road, Newtown',
      scope_summary: 'EV charger installation in the shared garage, including sub-main check.',
      gst_inclusive: false, gst_rate: 0.15,
      valid_until: ahead(21), terms: business.default_terms, source: 'manual',
      created_at: ago(9), sent_at: ago(8), decided_at: ago(3),
    },
    items: [
      line('EV charger install — 7kW single phase', 1, 'each', 184000, 'material', { cost: 118000, markup: 55.9 }),
      line('New dedicated circuit', 1, 'each', 68000, 'service', { cost: 38000, markup: 78.9, notes: '22m run from board to garage.' }),
      line('Registered electrician — labour', 4, 'hour', 9000, 'service', { cost: 6500, markup: 38.5 }),
    ],
  },
  {
    quote: {
      id: 'quote_0039', business_id: BUSINESS_ID, customer_id: 'cust_tane', job_id: null,
      quote_number: `Q-${YEAR}-0039`, status: 'declined',
      site_address: '31 Owhiro Bay Parade, Wellington',
      scope_summary: 'Outdoor lighting and weatherproof GPOs for the deck.',
      gst_inclusive: false, gst_rate: 0.15,
      valid_until: ahead(4), terms: business.default_terms, source: 'manual',
      created_at: ago(26), sent_at: ago(25), decided_at: ago(18),
    },
    items: [
      line('Weatherproof double GPO — supply & install', 3, 'each', 16500, 'material', { cost: 9500, markup: 73.7 }),
      line('Deck step lighting — 8 point LED run', 1, 'each', 96000, 'material', { cost: 61000, markup: 57.4 }),
      line('Registered electrician — labour', 7, 'hour', 9000, 'service', { cost: 6500, markup: 38.5 }),
    ],
  },
  {
    quote: {
      id: 'quote_0040', business_id: BUSINESS_ID, customer_id: 'cust_gemma', job_id: null,
      quote_number: `Q-${YEAR}-0040`, status: 'sent',
      site_address: '5 Aro Street, Wellington',
      scope_summary: 'Lighting rough-in for the rear extension — 14 downlights, 3 pendant points, two-way switching.',
      gst_inclusive: false, gst_rate: 0.15,
      valid_until: ahead(16), terms: business.default_terms, source: 'manual',
      created_at: ago(15), sent_at: ago(14), decided_at: null,
    },
    items: [
      line('LED downlight — dimmable, supply & install', 14, 'each', 8500, 'material', { cost: 5200, markup: 63.5 }),
      line('Pendant point — supply & install', 3, 'each', 14500, 'material', { cost: 8200, markup: 76.8 }),
      line('Two-way switching — hallway and stair', 1, 'each', 38000, 'service', { cost: 21000, markup: 81 }),
      line('Registered electrician — labour', 11, 'hour', 9000, 'service', { cost: 6500, markup: 38.5 }),
      line('Gib repair allowance', 1, 'each', 40000, 'allowance', { notes: 'Only charged if patching is needed after the rough-in.' }),
    ],
  },
  {
    quote: {
      id: 'quote_0041', business_id: BUSINESS_ID, customer_id: 'cust_sina', job_id: null,
      quote_number: `Q-${YEAR}-0041`, status: 'sent',
      site_address: '77 Riddiford Street, Newtown',
      scope_summary: 'Bakery fit-out — three-phase oven point, prep bench power and under-shelf lighting.',
      gst_inclusive: false, gst_rate: 0.15,
      valid_until: ahead(24), terms: business.default_terms, source: 'manual',
      created_at: ago(6), sent_at: ago(5), decided_at: null,
    },
    items: [
      line('Three-phase oven point', 1, 'each', 285000, 'service', { cost: 176000, markup: 61.9, notes: 'Includes isolator and 16mm sub-main.' }),
      line('Double GPO — supply & install', 8, 'each', 12000, 'material', { cost: 6800, markup: 76.5 }),
      line('Under-shelf LED strip — prep bench', 6, 'm', 7200, 'material', { cost: 4100, markup: 75.6 }),
      line('Registered electrician — labour (after hours)', 16, 'hour', 12500, 'service', { cost: 8600, markup: 45.3, notes: 'Bakery trades daily — work is 6pm onwards.' }),
      line('Certificate of Compliance', 1, 'each', 12000, 'other'),
    ],
  },
  {
    quote: {
      id: 'quote_0042', business_id: BUSINESS_ID, customer_id: 'cust_dave', job_id: null,
      quote_number: `Q-${YEAR}-0042`, status: 'expired',
      site_address: '19 Helston Road, Johnsonville',
      scope_summary: 'Heat pump power supply and garage sub-board.',
      gst_inclusive: false, gst_rate: 0.15,
      valid_until: ago(5), terms: business.default_terms, source: 'manual',
      created_at: ago(44), sent_at: ago(43), decided_at: null,
    },
    items: [
      line('Heat pump power supply', 1, 'each', 54000, 'service', { cost: 31000, markup: 74.2 }),
      line('Garage sub-board — 4 way', 1, 'each', 88000, 'material', { cost: 55000, markup: 60 }),
      line('Registered electrician — labour', 5, 'hour', 9000, 'service', { cost: 6500, markup: 38.5 }),
    ],
  },
  {
    quote: {
      id: 'quote_0043', business_id: BUSINESS_ID, customer_id: 'cust_marcus', job_id: null,
      quote_number: `Q-${YEAR}-0043`, status: 'draft',
      site_address: '14 Rimu Grove, Karori',
      scope_summary: 'Kitchen and laundry rewire — old switchboard has no RCDs.',
      gst_inclusive: false, gst_rate: 0.15,
      valid_until: ahead(30), terms: business.default_terms, source: 'scan',
      created_at: ago(2), sent_at: null, decided_at: null,
    },
    items: [
      line('Switchboard upgrade — 8 way with RCDs', 1, 'each', 145000, 'material', { cost: 92000, markup: 57.6 }),
      line('LED downlight — dimmable, supply & install', 6, 'each', 8500, 'material', { cost: 5200, markup: 63.5 }),
      line('Double GPO — supply & install', 4, 'each', 12000, 'material', { cost: 6800, markup: 76.5 }),
      line('New dedicated circuit — laundry', 1, 'each', 68000, 'service', { cost: 38000, markup: 78.9 }),
      line('Appliance point (dishwasher / oven)', 1, 'each', 24000, 'service', { cost: 14000, markup: 71.4 }),
      line('Gib repair allowance', 1, 'each', 40000, 'allowance'),
      line('Registered electrician — labour', 20, 'hour', 9000, 'service', { cost: 6500, markup: 38.5, notes: 'Site notes said ~2.5 days.' }),
    ],
  },
  {
    quote: {
      id: 'quote_0044', business_id: BUSINESS_ID, customer_id: null, job_id: null,
      quote_number: `Q-${YEAR}-0044`, status: 'draft',
      site_address: null,
      scope_summary: null,
      gst_inclusive: false, gst_rate: 0.15,
      valid_until: ahead(30), terms: business.default_terms, source: 'manual',
      created_at: ago(0), sent_at: null, decided_at: null,
    },
    items: [],
  },
]

const quotes: Quote[] = []
const quoteItems: QuoteItem[] = []

for (const seed of seeds) {
  const items: QuoteItem[] = seed.items.map((item, index) => ({
    ...item,
    id: `${seed.quote.id}_item_${index}`,
    quote_id: seed.quote.id,
    sort_order: index,
  }))
  quoteItems.push(...items)
  // Totals are computed, never seeded by hand — same code path the app uses.
  quotes.push({
    ...seed.quote,
    ...calculateTotals(items, seed.quote.gst_inclusive, seed.quote.gst_rate),
  })
}

/* ------------------------------------------------------------------ */
/* Jobs — only ever created by an accepted quote                       */
/* ------------------------------------------------------------------ */

const jobs: Job[] = [
  {
    id: 'job_0037', business_id: BUSINESS_ID, customer_id: 'cust_priya', quote_id: 'quote_0037',
    site_address: '8 Thorndon Quay, Wellington',
    scope_summary: 'Switchboard upgrade and smoke alarm compliance across the ground floor flat.',
    created_at: ago(31),
  },
  {
    id: 'job_0038', business_id: BUSINESS_ID, customer_id: 'cust_alena', quote_id: 'quote_0038',
    site_address: '4/60 Adelaide Road, Newtown',
    scope_summary: 'EV charger installation in the shared garage, including sub-main check.',
    created_at: ago(3),
  },
]

/* ------------------------------------------------------------------ */
/* Follow-ups                                                          */
/* ------------------------------------------------------------------ */

const quoteById = (id: string) => quotes.find((q) => q.id === id)!
const customerName = (id: string | null) =>
  customers.find((c) => c.id === id)?.name ?? 'there'

const followUps: FollowUp[] = [
  // Gemma — first nudge done, second one is overdue. This is the one the
  // dashboard should be shouting about.
  {
    id: 'fu_0040_a', quote_id: 'quote_0040', scheduled_for: ago(11), status: 'done',
    draft_message: draftFollowUpMessage(quoteById('quote_0040'), customerName('cust_gemma'), 0),
    sent_manually_at: ago(11),
  },
  {
    id: 'fu_0040_b', quote_id: 'quote_0040', scheduled_for: ago(4), status: 'pending',
    draft_message: draftFollowUpMessage(quoteById('quote_0040'), customerName('cust_gemma'), 1),
    sent_manually_at: null,
  },
  {
    id: 'fu_0040_c', quote_id: 'quote_0040', scheduled_for: ahead(3), status: 'pending',
    draft_message: null, sent_manually_at: null,
  },
  // Sina — due today.
  {
    id: 'fu_0041_a', quote_id: 'quote_0041', scheduled_for: ahead(0), status: 'pending',
    draft_message: draftFollowUpMessage(quoteById('quote_0041'), customerName('cust_sina'), 0),
    sent_manually_at: null,
  },
  {
    id: 'fu_0041_b', quote_id: 'quote_0041', scheduled_for: ahead(6), status: 'pending',
    draft_message: null, sent_manually_at: null,
  },
  // Dave — quote expired, chasing was given up on.
  {
    id: 'fu_0042_a', quote_id: 'quote_0042', scheduled_for: ago(40), status: 'done',
    draft_message: null, sent_manually_at: ago(40),
  },
  {
    id: 'fu_0042_b', quote_id: 'quote_0042', scheduled_for: ago(33), status: 'skipped',
    draft_message: null, sent_manually_at: null,
  },
  // Settled quotes keep their history but need no further chasing.
  { id: 'fu_0037_a', quote_id: 'quote_0037', scheduled_for: ago(34), status: 'done', draft_message: null, sent_manually_at: ago(34) },
  { id: 'fu_0039_a', quote_id: 'quote_0039', scheduled_for: ago(22), status: 'done', draft_message: null, sent_manually_at: ago(22) },
]

/* ------------------------------------------------------------------ */
/* Note scan — the scanned-notes draft above came from these images    */
/* ------------------------------------------------------------------ */

/** Convert a pixel rect on the 800x1100 demo page into a normalised bbox. */
const box = (x: number, y: number, w: number, h: number) =>
  [x / 800, y / 1100, w / 800, h / 1100] as [number, number, number, number]

const field = <T,>(
  value: T | null,
  confidence: number,
  image: number | null,
  bbox: [number, number, number, number] | null,
) => ({ value, confidence, source_image_index: image, source_bbox: bbox })

const demoExtraction: ExtractionResult = {
  customer: {
    name: field('Marcus Whiting', 0.94, 0, box(108, 112, 260, 42)),
    phone: field('021 447 8892', 0.91, 0, box(108, 162, 220, 42)),
    email: field(null, 0, null, null),
    address: field('14 Rimu Grove, Karori', 0.86, 0, box(108, 212, 320, 42)),
  },
  site: {
    address: field('14 Rimu Grove, Karori', 0.86, 0, box(108, 212, 320, 42)),
  },
  scope: field(
    'Kitchen and laundry rewire. Old switchboard, no RCDs.',
    0.88,
    0,
    box(108, 262, 380, 92),
  ),
  line_items: [
    {
      description: field('Replace switchboard — 8 way', 0.92, 0, box(108, 362, 300, 42)),
      quantity: field(1, 0.95, 0, box(108, 362, 300, 42)),
      unit: field('each', 0.9, null, null),
      price_guess: field(145000, 0.61, 1, box(84, 112, 300, 44)),
      type: field('material' as const, 0.84, null, null),
    },
    {
      description: field('LED downlights — kitchen', 0.93, 0, box(108, 412, 340, 42)),
      quantity: field(6, 0.96, 0, box(108, 412, 340, 42)),
      unit: field('each', 0.92, null, null),
      price_guess: field(8500, 0.89, 1, box(84, 172, 290, 44)),
      type: field('material' as const, 0.88, null, null),
    },
    {
      description: field('New double GPOs', 0.9, 0, box(108, 462, 290, 42)),
      quantity: field(4, 0.94, 0, box(108, 462, 290, 42)),
      unit: field('each', 0.92, null, null),
      price_guess: field(12000, 0.87, 1, box(84, 232, 250, 44)),
      type: field('material' as const, 0.86, null, null),
    },
    {
      description: field('New circuit — laundry', 0.91, 0, box(108, 512, 300, 42)),
      quantity: field(1, 0.93, 0, box(108, 512, 300, 42)),
      unit: field('each', 0.9, null, null),
      price_guess: field(68000, 0.85, 1, box(84, 292, 280, 44)),
      type: field('service' as const, 0.79, null, null),
    },
    {
      description: field('Dishwasher point', 0.92, 0, box(108, 562, 240, 42)),
      quantity: field(1, 0.93, 0, box(108, 562, 240, 42)),
      unit: field('each', 0.9, null, null),
      price_guess: field(24000, 0.86, 1, box(84, 352, 260, 44)),
      type: field('service' as const, 0.81, null, null),
    },
    {
      description: field('Gib repair allowance', 0.89, 0, box(108, 612, 300, 42)),
      quantity: field(1, 0.9, 0, box(108, 612, 300, 42)),
      unit: field('each', 0.88, null, null),
      price_guess: field(40000, 0.9, 1, box(84, 472, 280, 44)),
      type: field('allowance' as const, 0.87, null, null),
    },
    {
      description: field('Labour', 0.87, 0, box(108, 662, 280, 42)),
      // "approx 2.5 days" — a real ambiguity, so it comes back low-confidence
      // and lands in the review queue rather than being silently converted.
      quantity: field(20, 0.42, 0, box(108, 662, 280, 42)),
      unit: field('hour', 0.48, 0, box(108, 662, 280, 42)),
      price_guess: field(null, 0.18, 1, box(84, 412, 330, 46)),
      type: field('service' as const, 0.9, null, null),
    },
  ],
  notes: field(
    'Wants the work done before Christmas. Park on the street — no driveway access.',
    0.72,
    0,
    box(108, 762, 400, 92),
  ),
  unreadable_notes: [
    'A line under the labour note on page 1 could not be read — it looks like a phone preference and a signature.',
    'The hourly labour rate on page 2 was left blank on the page.',
  ],
  model: 'demo-extractor',
  extracted_at: ago(2),
}

const noteScans: NoteScan[] = [
  {
    id: 'scan_0043',
    quote_id: 'quote_0043',
    image_urls: ['/demo-notes/note-1.svg', '/demo-notes/note-2.svg'],
    raw_extraction_json: demoExtraction,
    status: 'reviewed',
    created_at: ago(2),
  },
]

/** A fresh copy of the demo dataset. */
export function buildSeedSnapshot(): Snapshot {
  return structuredClone({
    business,
    customers,
    quotes,
    quoteItems,
    priceBook,
    followUps,
    jobs,
    noteScans,
  })
}

export const DEMO_BUSINESS_ID = BUSINESS_ID
export const DEMO_NOTE_IMAGES = ['/demo-notes/note-1.svg', '/demo-notes/note-2.svg']
export { demoExtraction }
