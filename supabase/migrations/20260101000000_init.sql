-- QuoteFlow initial schema.
--
-- Money columns are bigint minor units (cents). All price/tax arithmetic is
-- performed in application code (src/lib/money.ts), never in the database and
-- never by an AI model.

create extension if not exists "pgcrypto";

create type quote_status   as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
create type quote_source   as enum ('scan', 'manual');
create type line_item_type as enum ('service', 'material', 'allowance', 'other');
create type follow_up_status as enum ('pending', 'done', 'skipped');
create type scan_status    as enum ('processing', 'needs_review', 'reviewed');

-- ---------------------------------------------------------------- business

create table business_profile (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid references auth.users (id) on delete cascade,
  business_name         text        not null,
  logo_url              text,
  -- Explicit setting, never inferred from the numbers the user types.
  gst_inclusive         boolean     not null default false,
  gst_rate              numeric(6,4) not null default 0.15,
  -- Tax is not hardcoded to NZ: the label and rate are both data, so another
  -- region's tax model can be swapped in without a migration.
  tax_label             text        not null default 'GST',
  currency_code         text        not null default 'NZD',
  default_terms         text        not null default '',
  default_validity_days integer     not null default 30,
  contact_email         text,
  contact_phone         text,
  address               text,
  created_at            timestamptz not null default now(),
  constraint gst_rate_sane check (gst_rate >= 0 and gst_rate < 1)
);

-- --------------------------------------------------------------- customers

create table customers (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profile (id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now()
);

create index customers_business_idx on customers (business_id);
-- Supports the fuzzy name match that stops a scan silently duplicating a customer.
create index customers_name_idx on customers (business_id, lower(name));

-- ------------------------------------------------------------------- jobs

-- A job is created only when a quote is accepted, snapshotting the customer,
-- site and scope from the quote at that moment.
create table jobs (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business_profile (id) on delete cascade,
  customer_id   uuid references customers (id) on delete set null,
  quote_id      uuid not null,
  site_address  text,
  scope_summary text,
  created_at    timestamptz not null default now()
);

create index jobs_business_idx on jobs (business_id);

-- ----------------------------------------------------------------- quotes

create table quotes (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business_profile (id) on delete cascade,
  customer_id   uuid references customers (id) on delete set null,
  -- Null until the quote is accepted.
  job_id        uuid references jobs (id) on delete set null,
  quote_number  text not null,
  status        quote_status not null default 'draft',
  site_address  text,
  scope_summary text,
  -- Snapshotted from the business profile at creation, overridable per quote.
  gst_inclusive boolean not null default false,
  gst_rate      numeric(6,4) not null default 0.15,
  subtotal      bigint not null default 0,
  gst_amount    bigint not null default 0,
  total         bigint not null default 0,
  valid_until   timestamptz,
  terms         text,
  source        quote_source not null default 'manual',
  -- Opaque token for the customer-facing link; not guessable from the quote id.
  public_token  text not null default encode(gen_random_bytes(16), 'hex'),
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  decided_at    timestamptz,
  unique (business_id, quote_number)
);

create index quotes_business_status_idx on quotes (business_id, status);
create unique index quotes_public_token_idx on quotes (public_token);

alter table jobs
  add constraint jobs_quote_id_fkey foreign key (quote_id) references quotes (id) on delete cascade;

-- ------------------------------------------------------------ quote items

create table quote_items (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid not null references quotes (id) on delete cascade,
  description   text not null default '',
  quantity      numeric(12,3) not null default 1,
  unit          text not null default 'each',
  cost          bigint,
  markup        numeric(8,2),
  selling_price bigint not null default 0,
  type          line_item_type not null default 'service',
  notes         text,
  sort_order    integer not null default 0
);

create index quote_items_quote_idx on quote_items (quote_id, sort_order);

-- -------------------------------------------------------------- price book

create table price_book_items (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business_profile (id) on delete cascade,
  name          text not null,
  type          line_item_type not null default 'service',
  unit          text not null default 'each',
  cost          bigint,
  markup        numeric(8,2),
  selling_price bigint not null default 0
);

create index price_book_business_idx on price_book_items (business_id);

-- -------------------------------------------------------------- follow-ups

create table follow_ups (
  id               uuid primary key default gen_random_uuid(),
  quote_id         uuid not null references quotes (id) on delete cascade,
  scheduled_for    timestamptz not null,
  status           follow_up_status not null default 'pending',
  draft_message    text,
  -- Set only when the contractor explicitly sends. Nothing sends on its own.
  sent_manually_at timestamptz
);

create index follow_ups_due_idx on follow_ups (status, scheduled_for);

-- ------------------------------------------------------------- note scans

create table note_scans (
  id                  uuid primary key default gen_random_uuid(),
  quote_id            uuid references quotes (id) on delete cascade,
  image_urls          text[] not null default '{}',
  -- Each field inside carries { value, confidence, source_image_index,
  -- source_bbox } so the Review screen can show the crop a value came from.
  raw_extraction_json jsonb,
  status              scan_status not null default 'processing',
  created_at          timestamptz not null default now()
);

create index note_scans_quote_idx on note_scans (quote_id);

-- --------------------------------------------------------------------- RLS

alter table business_profile  enable row level security;
alter table customers         enable row level security;
alter table quotes            enable row level security;
alter table quote_items       enable row level security;
alter table price_book_items  enable row level security;
alter table follow_ups        enable row level security;
alter table note_scans        enable row level security;
alter table jobs              enable row level security;

-- Businesses the signed-in user owns.
create or replace function owned_business_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from business_profile where owner_id = auth.uid();
$$;

create policy business_owner_all on business_profile
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy customers_owner_all on customers
  for all using (business_id in (select owned_business_ids()))
  with check (business_id in (select owned_business_ids()));

create policy quotes_owner_all on quotes
  for all using (business_id in (select owned_business_ids()))
  with check (business_id in (select owned_business_ids()));

create policy price_book_owner_all on price_book_items
  for all using (business_id in (select owned_business_ids()))
  with check (business_id in (select owned_business_ids()));

create policy jobs_owner_all on jobs
  for all using (business_id in (select owned_business_ids()))
  with check (business_id in (select owned_business_ids()));

create policy quote_items_owner_all on quote_items
  for all using (quote_id in (select id from quotes))
  with check (quote_id in (select id from quotes));

create policy follow_ups_owner_all on follow_ups
  for all using (quote_id in (select id from quotes))
  with check (quote_id in (select id from quotes));

create policy note_scans_owner_all on note_scans
  for all using (quote_id is null or quote_id in (select id from quotes))
  with check (quote_id is null or quote_id in (select id from quotes));

-- ------------------------------------------- customer-facing quote access

-- The public link exposes exactly one quote, by unguessable token, and allows
-- only an accept/decline decision. It is a security-definer function rather
-- than a permissive RLS policy so anonymous readers can never enumerate quotes.
create or replace function public_quote(token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quote', to_jsonb(q) - 'public_token',
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.sort_order)
      from quote_items i where i.quote_id = q.id
    ), '[]'::jsonb),
    'customer', to_jsonb(c),
    'business', to_jsonb(b) - 'owner_id'
  )
  from quotes q
  join business_profile b on b.id = q.business_id
  left join customers c on c.id = q.customer_id
  where q.public_token = token
    and q.status in ('sent', 'accepted', 'declined', 'expired');
$$;

create or replace function decide_public_quote(token text, decision text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  target quotes;
  new_job_id uuid;
begin
  if decision not in ('accepted', 'declined') then
    raise exception 'decision must be accepted or declined';
  end if;

  -- Only a quote that is still awaiting a response can be decided, so a link
  -- shared around can't flip an already-settled quote.
  select * into target from quotes where public_token = token and status = 'sent' for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;

  if decision = 'accepted' then
    -- Acceptance is what creates the job, snapshotting the quote as it stands.
    insert into jobs (business_id, customer_id, quote_id, site_address, scope_summary)
    values (target.business_id, target.customer_id, target.id, target.site_address, target.scope_summary)
    returning id into new_job_id;
  end if;

  update quotes
     set status = decision::quote_status,
         decided_at = now(),
         job_id = coalesce(new_job_id, job_id)
   where id = target.id;

  -- A decided quote needs no more chasing.
  update follow_ups set status = 'skipped'
   where quote_id = target.id and status = 'pending';

  return jsonb_build_object('ok', true, 'status', decision);
end;
$$;

grant execute on function public_quote(text) to anon, authenticated;
grant execute on function decide_public_quote(text, text) to anon, authenticated;
