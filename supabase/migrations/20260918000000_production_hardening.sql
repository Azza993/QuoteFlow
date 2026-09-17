-- QuoteFlow production hardening.
--
-- These constraints/policies move important integrity guarantees below the
-- browser. The frontend still enforces the same rules for UX, but a client
-- must not be able to bypass them by calling Supabase directly.

-- An accepted quote creates one job. Prevent duplicate jobs for the same quote.
create unique index if not exists jobs_quote_id_unique_idx on jobs (quote_id);

-- A quote's customer must belong to the same business as the quote.
create unique index if not exists customers_id_business_unique_idx on customers (id, business_id);

alter table quotes drop constraint if exists quotes_customer_id_fkey;
alter table quotes
  add constraint quotes_customer_business_fkey
  foreign key (customer_id, business_id)
  references customers (id, business_id)
  on delete set null;

alter table jobs drop constraint if exists jobs_customer_id_fkey;
alter table jobs
  add constraint jobs_customer_business_fkey
  foreign key (customer_id, business_id)
  references customers (id, business_id)
  on delete set null;

-- Accepted quotes are historical records. Deleting one must never silently
-- remove the job created from it.
create or replace function prevent_accepted_quote_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'accepted' then
    raise exception 'accepted quotes cannot be deleted; archive the quote instead';
  end if;
  return old;
end;
$$;

drop trigger if exists quotes_prevent_accepted_delete on quotes;
create trigger quotes_prevent_accepted_delete
before delete on quotes
for each row execute function prevent_accepted_quote_delete();

-- Tighten child-table ownership checks. The previous policies only checked
-- whether a quote id existed; these policies explicitly require that quote to
-- belong to a business owned by the current authenticated user.
drop policy if exists quote_items_owner_all on quote_items;
create policy quote_items_owner_all on quote_items
  for all
  using (
    exists (
      select 1
      from quotes q
      where q.id = quote_items.quote_id
        and q.business_id in (select owned_business_ids())
    )
  )
  with check (
    exists (
      select 1
      from quotes q
      where q.id = quote_items.quote_id
        and q.business_id in (select owned_business_ids())
    )
  );

drop policy if exists follow_ups_owner_all on follow_ups;
create policy follow_ups_owner_all on follow_ups
  for all
  using (
    exists (
      select 1
      from quotes q
      where q.id = follow_ups.quote_id
        and q.business_id in (select owned_business_ids())
    )
  )
  with check (
    exists (
      select 1
      from quotes q
      where q.id = follow_ups.quote_id
        and q.business_id in (select owned_business_ids())
    )
  );

drop policy if exists note_scans_owner_all on note_scans;
create policy note_scans_owner_all on note_scans
  for all
  using (
    quote_id is not null
    and exists (
      select 1
      from quotes q
      where q.id = note_scans.quote_id
        and q.business_id in (select owned_business_ids())
    )
  )
  with check (
    quote_id is not null
    and exists (
      select 1
      from quotes q
      where q.id = note_scans.quote_id
        and q.business_id in (select owned_business_ids())
    )
  );

-- Public customers only need their name for the quote document. Do not expose
-- the contractor's private customer email/phone/address through the anonymous
-- RPC.
create or replace function public_quote(token text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quote', to_jsonb(q) - 'public_token',
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.sort_order)
      from quote_items i where i.quote_id = q.id
    ), '[]'::jsonb),
    'customer', case when c.id is null then null else jsonb_build_object(
      'id', c.id,
      'business_id', c.business_id,
      'name', c.name,
      'phone', null,
      'email', null,
      'address', null,
      'notes', null,
      'created_at', c.created_at
    ) end,
    'business', to_jsonb(b) - 'owner_id'
  )
  from quotes q
  join business_profile b on b.id = q.business_id
  left join customers c on c.id = q.customer_id
  where q.public_token = token
    and q.status in ('sent', 'accepted', 'declined', 'expired');
$$;

grant execute on function public_quote(text) to anon, authenticated;
