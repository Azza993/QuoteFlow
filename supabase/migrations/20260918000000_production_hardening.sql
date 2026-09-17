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

-- ------------------------------------------------------------ note storage
-- Scan photos are private business data. Store them outside the database in a
-- private bucket and keep only durable object paths in note_scans.image_urls.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-scans',
  'note-scans',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object paths are `<business_id>/<scan_id>/<random-file>`. The first folder
-- is the business id, so storage access can be tied to the same ownership
-- function used by the relational tables.
drop policy if exists note_scan_objects_owner_insert on storage.objects;
create policy note_scan_objects_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'note-scans'
    and (storage.foldername(name))[1] in (select id::text from business_profile where id in (select owned_business_ids()))
  );

drop policy if exists note_scan_objects_owner_select on storage.objects;
create policy note_scan_objects_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'note-scans'
    and (storage.foldername(name))[1] in (select id::text from business_profile where id in (select owned_business_ids()))
  );

drop policy if exists note_scan_objects_owner_delete on storage.objects;
create policy note_scan_objects_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'note-scans'
    and (storage.foldername(name))[1] in (select id::text from business_profile where id in (select owned_business_ids()))
  );

-- --------------------------------------------------------------- auth setup
-- Create a private business workspace automatically when a user signs up.
-- This keeps the first authenticated session usable without a privileged
-- service key in the browser. The business name comes from sign-up metadata.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.business_profile (owner_id, business_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''), 'My Business')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_quoteflow on auth.users;
create trigger on_auth_user_created_quoteflow
after insert on auth.users
for each row execute function public.handle_new_auth_user();
