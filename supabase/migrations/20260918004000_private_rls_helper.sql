-- Keep the ownership helper out of the PostgREST-exposed public schema.
-- RLS policies need to invoke it, but clients should not be able to call it as an API RPC.

create schema if not exists private;

create or replace function private.owned_business_ids()
returns table(business_id uuid)
language sql
security definer
set search_path = public
as $$
  select id
  from public.business_profile
  where owner_id = auth.uid();
$$;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on function private.owned_business_ids() from public, anon, authenticated;
grant execute on function private.owned_business_ids() to authenticated;

drop policy if exists customers_owner_all on public.customers;
create policy customers_owner_all on public.customers
  for all
  using (business_id in (select private.owned_business_ids()))
  with check (business_id in (select private.owned_business_ids()));

drop policy if exists jobs_owner_all on public.jobs;
create policy jobs_owner_all on public.jobs
  for all
  using (business_id in (select private.owned_business_ids()))
  with check (business_id in (select private.owned_business_ids()));

drop policy if exists price_book_owner_all on public.price_book_items;
create policy price_book_owner_all on public.price_book_items
  for all
  using (business_id in (select private.owned_business_ids()))
  with check (business_id in (select private.owned_business_ids()));

drop policy if exists quotes_owner_all on public.quotes;
create policy quotes_owner_all on public.quotes
  for all
  using (business_id in (select private.owned_business_ids()))
  with check (business_id in (select private.owned_business_ids()));

drop policy if exists quote_items_owner_all on public.quote_items;
create policy quote_items_owner_all on public.quote_items
  for all
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and q.business_id in (select private.owned_business_ids())
  ))
  with check (exists (
    select 1 from public.quotes q
    where q.id = quote_items.quote_id
      and q.business_id in (select private.owned_business_ids())
  ));

drop policy if exists follow_ups_owner_all on public.follow_ups;
create policy follow_ups_owner_all on public.follow_ups
  for all
  using (exists (
    select 1 from public.quotes q
    where q.id = follow_ups.quote_id
      and q.business_id in (select private.owned_business_ids())
  ))
  with check (exists (
    select 1 from public.quotes q
    where q.id = follow_ups.quote_id
      and q.business_id in (select private.owned_business_ids())
  ));

drop policy if exists note_scans_owner_all on public.note_scans;
create policy note_scans_owner_all on public.note_scans
  for all
  using (quote_id is not null and exists (
    select 1 from public.quotes q
    where q.id = note_scans.quote_id
      and q.business_id in (select private.owned_business_ids())
  ))
  with check (quote_id is not null and exists (
    select 1 from public.quotes q
    where q.id = note_scans.quote_id
      and q.business_id in (select private.owned_business_ids())
  ));

revoke all on function public.owned_business_ids() from public, anon, authenticated;
