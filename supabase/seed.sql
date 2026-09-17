-- Demo data for a Supabase-backed QuoteFlow.
--
-- Mirrors the in-app demo dataset so a fresh project looks and feels the same.
-- Money columns are minor units (cents). Dates are relative to now() so the
-- dashboard always shows a live mix of work.
--
-- Run with: supabase db reset   (or psql -f supabase/seed.sql)

begin;

-- Attach the demo business to the first auth user if one exists, so RLS lets
-- you see it after signing in. Harmless when there are no users yet.
insert into business_profile (
  id, owner_id, business_name, gst_inclusive, gst_rate, tax_label, currency_code,
  default_terms, default_validity_days, contact_email, contact_phone, address
) values (
  '00000000-0000-4000-8000-000000000001',
  (select id from auth.users order by created_at limit 1),
  'Harrow Electrical', false, 0.15, 'GST', 'NZD',
  'Payment due 14 days from invoice date. Quote covers the scope described above; variations will be quoted separately before work proceeds. Price subject to site access as discussed.',
  30, 'jobs@harrowelectrical.co.nz', '021 338 0192', '12 Kaiwharawhara Road, Wellington 6035'
);

-- ----------------------------------------------------------------- customers

insert into customers (id, business_id, name, phone, email, address, notes, created_at) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Priya Raman',    '027 884 1120', 'priya.raman@gmail.com',      '8 Thorndon Quay, Wellington',     'Repeat customer — rental portfolio, 3 properties.', now() - interval '260 days'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Tane Ropata',    '021 559 0043', 'tane.ropata@outlook.co.nz',  '31 Owhiro Bay Parade, Wellington', null,                                               now() - interval '140 days'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Gemma Clarke',   '022 401 7789', 'gemma@clarkeandco.nz',       '5 Aro Street, Wellington',         'Architect — refers work regularly. Worth chasing properly.', now() - interval '95 days'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Sina Faleolo',   '021 220 6614', 'sina@kowhaibakery.nz',       '77 Riddiford Street, Newtown',     'Kōwhai Bakery. Fit-out work, after-hours access only.',      now() - interval '62 days'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'Dave Mihaka',    '027 118 2204', null,                        '19 Helston Road, Johnsonville',    null,                                               now() - interval '48 days'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'Marcus Whiting', '021 447 8892', null,                        '14 Rimu Grove, Karori',            'Created from scanned site notes.',                 now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000001', 'Alena Novak',    '021 902 3341', 'alena.novak@proton.me',      '4/60 Adelaide Road, Newtown',      null,                                               now() - interval '9 days');

-- --------------------------------------------------------------- price book

insert into price_book_items (business_id, name, type, unit, cost, markup, selling_price) values
  ('00000000-0000-4000-8000-000000000001', 'Registered electrician — labour',            'service',   'hour', 6500,   38.5, 9000),
  ('00000000-0000-4000-8000-000000000001', 'Apprentice — labour',                        'service',   'hour', 3200,   40.6, 4500),
  ('00000000-0000-4000-8000-000000000001', 'Callout / site visit',                       'service',   'each', null,   null, 9500),
  ('00000000-0000-4000-8000-000000000001', 'LED downlight — dimmable, supply & install', 'material',  'each', 5200,   63.5, 8500),
  ('00000000-0000-4000-8000-000000000001', 'Double GPO — supply & install',              'material',  'each', 6800,   76.5, 12000),
  ('00000000-0000-4000-8000-000000000001', 'Switchboard upgrade — 8 way with RCDs',      'material',  'each', 92000,  57.6, 145000),
  ('00000000-0000-4000-8000-000000000001', 'New dedicated circuit',                      'service',   'each', 38000,  78.9, 68000),
  ('00000000-0000-4000-8000-000000000001', 'Appliance point (dishwasher / oven)',        'service',   'each', 14000,  71.4, 24000),
  ('00000000-0000-4000-8000-000000000001', 'Photoelectric smoke alarm — 10yr',           'material',  'each', 4800,   66.7, 8000),
  ('00000000-0000-4000-8000-000000000001', 'EV charger install — 7kW single phase',      'material',  'each', 118000, 55.9, 184000),
  ('00000000-0000-4000-8000-000000000001', 'Gib repair allowance',                       'allowance', 'each', null,   null, 40000),
  ('00000000-0000-4000-8000-000000000001', 'Certificate of Compliance',                  'other',     'each', null,   null, 12000);

-- ------------------------------------------------------------------- quotes

insert into quotes (
  id, business_id, customer_id, quote_number, status, site_address, scope_summary,
  gst_inclusive, gst_rate, valid_until, terms, source, created_at, sent_at, decided_at
)
select
  q.id, '00000000-0000-4000-8000-000000000001', q.customer_id,
  'Q-' || extract(year from now())::text || '-' || q.seq,
  q.status::quote_status, q.site, q.scope,
  false, 0.15, now() + (q.valid_days || ' days')::interval,
  (select default_terms from business_profile limit 1),
  q.source::quote_source,
  now() - (q.age || ' days')::interval,
  case when q.sent_age is null then null else now() - (q.sent_age || ' days')::interval end,
  case when q.decided_age is null then null else now() - (q.decided_age || ' days')::interval end
from (values
  ('00000000-0000-4000-8000-000000000201'::uuid, '00000000-0000-4000-8000-000000000101'::uuid, '0037', 'accepted', '8 Thorndon Quay, Wellington',      'Switchboard upgrade and smoke alarm compliance across the ground floor flat.',                     9,  'manual', 38, 37, 31),
  ('00000000-0000-4000-8000-000000000202'::uuid, '00000000-0000-4000-8000-000000000107'::uuid, '0038', 'accepted', '4/60 Adelaide Road, Newtown',      'EV charger installation in the shared garage, including sub-main check.',                          21, 'manual', 9,  8,  3),
  ('00000000-0000-4000-8000-000000000203'::uuid, '00000000-0000-4000-8000-000000000102'::uuid, '0039', 'declined', '31 Owhiro Bay Parade, Wellington', 'Outdoor lighting and weatherproof GPOs for the deck.',                                             4,  'manual', 26, 25, 18),
  ('00000000-0000-4000-8000-000000000204'::uuid, '00000000-0000-4000-8000-000000000103'::uuid, '0040', 'sent',     '5 Aro Street, Wellington',         'Lighting rough-in for the rear extension — 14 downlights, 3 pendant points, two-way switching.',   16, 'manual', 15, 14, null),
  ('00000000-0000-4000-8000-000000000205'::uuid, '00000000-0000-4000-8000-000000000104'::uuid, '0041', 'sent',     '77 Riddiford Street, Newtown',     'Bakery fit-out — three-phase oven point, prep bench power and under-shelf lighting.',              24, 'manual', 6,  5,  null),
  ('00000000-0000-4000-8000-000000000206'::uuid, '00000000-0000-4000-8000-000000000105'::uuid, '0042', 'expired',  '19 Helston Road, Johnsonville',    'Heat pump power supply and garage sub-board.',                                                     -5, 'manual', 44, 43, null),
  ('00000000-0000-4000-8000-000000000207'::uuid, '00000000-0000-4000-8000-000000000106'::uuid, '0043', 'draft',    '14 Rimu Grove, Karori',            'Kitchen and laundry rewire — old switchboard has no RCDs.',                                        30, 'scan',   2,  null, null)
) as q(id, customer_id, seq, status, site, scope, valid_days, source, age, sent_age, decided_age);

-- -------------------------------------------------------------- quote items

insert into quote_items (quote_id, description, quantity, unit, cost, markup, selling_price, type, notes, sort_order) values
  -- Q-0037
  ('00000000-0000-4000-8000-000000000201', 'Switchboard upgrade — 8 way with RCDs', 1, 'each', 92000, 57.6, 145000, 'material', null, 0),
  ('00000000-0000-4000-8000-000000000201', 'Registered electrician — labour',       6, 'hour', 6500,  38.5, 9000,   'service',  null, 1),
  ('00000000-0000-4000-8000-000000000201', 'Photoelectric smoke alarm — 10yr',      4, 'each', 4800,  66.7, 8000,   'material', 'Bedrooms + hallway, hard-wired.', 2),
  ('00000000-0000-4000-8000-000000000201', 'Certificate of Compliance',             1, 'each', null,  null, 12000,  'other',    null, 3),
  -- Q-0038
  ('00000000-0000-4000-8000-000000000202', 'EV charger install — 7kW single phase', 1, 'each', 118000, 55.9, 184000, 'material', null, 0),
  ('00000000-0000-4000-8000-000000000202', 'New dedicated circuit',                 1, 'each', 38000,  78.9, 68000,  'service',  '22m run from board to garage.', 1),
  ('00000000-0000-4000-8000-000000000202', 'Registered electrician — labour',       4, 'hour', 6500,   38.5, 9000,   'service',  null, 2),
  -- Q-0039
  ('00000000-0000-4000-8000-000000000203', 'Weatherproof double GPO — supply & install', 3, 'each', 9500,  73.7, 16500, 'material', null, 0),
  ('00000000-0000-4000-8000-000000000203', 'Deck step lighting — 8 point LED run',       1, 'each', 61000, 57.4, 96000, 'material', null, 1),
  ('00000000-0000-4000-8000-000000000203', 'Registered electrician — labour',            7, 'hour', 6500,  38.5, 9000,  'service',  null, 2),
  -- Q-0040
  ('00000000-0000-4000-8000-000000000204', 'LED downlight — dimmable, supply & install', 14, 'each', 5200,  63.5, 8500,  'material',  null, 0),
  ('00000000-0000-4000-8000-000000000204', 'Pendant point — supply & install',            3, 'each', 8200,  76.8, 14500, 'material',  null, 1),
  ('00000000-0000-4000-8000-000000000204', 'Two-way switching — hallway and stair',       1, 'each', 21000, 81,   38000, 'service',   null, 2),
  ('00000000-0000-4000-8000-000000000204', 'Registered electrician — labour',            11, 'hour', 6500,  38.5, 9000,  'service',   null, 3),
  ('00000000-0000-4000-8000-000000000204', 'Gib repair allowance',                        1, 'each', null,  null, 40000, 'allowance', 'Only charged if patching is needed after the rough-in.', 4),
  -- Q-0041
  ('00000000-0000-4000-8000-000000000205', 'Three-phase oven point',                      1, 'each', 176000, 61.9, 285000, 'service',  'Includes isolator and 16mm sub-main.', 0),
  ('00000000-0000-4000-8000-000000000205', 'Double GPO — supply & install',               8, 'each', 6800,   76.5, 12000,  'material', null, 1),
  ('00000000-0000-4000-8000-000000000205', 'Under-shelf LED strip — prep bench',           6, 'm',    4100,   75.6, 7200,   'material', null, 2),
  ('00000000-0000-4000-8000-000000000205', 'Registered electrician — labour (after hours)',16,'hour', 8600,   45.3, 12500,  'service',  'Bakery trades daily — work is 6pm onwards.', 3),
  ('00000000-0000-4000-8000-000000000205', 'Certificate of Compliance',                    1, 'each', null,   null, 12000,  'other',    null, 4),
  -- Q-0042
  ('00000000-0000-4000-8000-000000000206', 'Heat pump power supply',    1, 'each', 31000, 74.2, 54000, 'service',  null, 0),
  ('00000000-0000-4000-8000-000000000206', 'Garage sub-board — 4 way',  1, 'each', 55000, 60,   88000, 'material', null, 1),
  ('00000000-0000-4000-8000-000000000206', 'Registered electrician — labour', 5, 'hour', 6500, 38.5, 9000, 'service', null, 2),
  -- Q-0043 (from the scanned notes)
  ('00000000-0000-4000-8000-000000000207', 'Switchboard upgrade — 8 way with RCDs',       1,  'each', 92000, 57.6, 145000, 'material',  null, 0),
  ('00000000-0000-4000-8000-000000000207', 'LED downlight — dimmable, supply & install',  6,  'each', 5200,  63.5, 8500,   'material',  null, 1),
  ('00000000-0000-4000-8000-000000000207', 'Double GPO — supply & install',               4,  'each', 6800,  76.5, 12000,  'material',  null, 2),
  ('00000000-0000-4000-8000-000000000207', 'New dedicated circuit — laundry',             1,  'each', 38000, 78.9, 68000,  'service',   null, 3),
  ('00000000-0000-4000-8000-000000000207', 'Appliance point (dishwasher / oven)',         1,  'each', 14000, 71.4, 24000,  'service',   null, 4),
  ('00000000-0000-4000-8000-000000000207', 'Gib repair allowance',                        1,  'each', null,  null, 40000,  'allowance', null, 5),
  ('00000000-0000-4000-8000-000000000207', 'Registered electrician — labour',             20, 'hour', 6500,  38.5, 9000,   'service',   'Site notes said ~2.5 days.', 6);

-- Totals are derived from the line items, exactly as the app derives them.
-- Seeded prices are tax-exclusive, so tax is added on top.
update quotes q set
  subtotal = t.sum,
  gst_amount = round(t.sum * q.gst_rate),
  total = t.sum + round(t.sum * q.gst_rate)
from (
  select quote_id, sum(round(quantity * selling_price))::bigint as sum
  from quote_items group by quote_id
) t
where t.quote_id = q.id;

-- --------------------------------------------------------------------- jobs

-- Accepted quotes, and only accepted quotes, have a job.
insert into jobs (business_id, customer_id, quote_id, site_address, scope_summary, created_at)
select business_id, customer_id, id, site_address, scope_summary, decided_at
from quotes where status = 'accepted';

update quotes q set job_id = j.id from jobs j where j.quote_id = q.id;

-- -------------------------------------------------------------- follow-ups

insert into follow_ups (quote_id, scheduled_for, status, draft_message, sent_manually_at) values
  -- Gemma: first nudge sent, second one overdue — this is what the dashboard shouts about.
  ('00000000-0000-4000-8000-000000000204', now() - interval '11 days', 'done',    'Hi Gemma, just checking you received quote for the rear extension lighting.', now() - interval '11 days'),
  ('00000000-0000-4000-8000-000000000204', now() - interval '4 days',  'pending', null, null),
  ('00000000-0000-4000-8000-000000000204', now() + interval '3 days',  'pending', null, null),
  -- Sina: due today.
  ('00000000-0000-4000-8000-000000000205', now(),                      'pending', null, null),
  ('00000000-0000-4000-8000-000000000205', now() + interval '6 days',  'pending', null, null),
  -- Dave: chasing was given up on before the quote expired.
  ('00000000-0000-4000-8000-000000000206', now() - interval '40 days', 'done',    null, now() - interval '40 days'),
  ('00000000-0000-4000-8000-000000000206', now() - interval '33 days', 'skipped', null, null),
  -- Settled quotes keep their history but need no further chasing.
  ('00000000-0000-4000-8000-000000000201', now() - interval '34 days', 'done',    null, now() - interval '34 days'),
  ('00000000-0000-4000-8000-000000000203', now() - interval '22 days', 'done',    null, now() - interval '22 days');

commit;
