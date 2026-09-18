-- Tighten revision state and immutability.
drop policy if exists quote_revisions_owner_all on public.quote_revisions;
create policy quote_revisions_owner_select on public.quote_revisions
  for select to authenticated
  using (business_id in (select owned_business_ids()));

create policy quote_revisions_owner_insert on public.quote_revisions
  for insert to authenticated
  with check (
    business_id in (select owned_business_ids())
    and status='draft'
    and created_by=(select auth.uid())
  );

create policy quote_revisions_owner_update on public.quote_revisions
  for update to authenticated
  using (business_id in (select owned_business_ids()) and status='draft')
  with check (business_id in (select owned_business_ids()) and status='draft');

create policy quote_revisions_owner_delete on public.quote_revisions
  for delete to authenticated
  using (business_id in (select owned_business_ids()) and status='draft');

drop policy if exists quote_revision_items_owner_all on public.quote_revision_items;
create policy quote_revision_items_owner_select on public.quote_revision_items
  for select to authenticated
  using (exists (
    select 1 from public.quote_revisions r
    where r.id=quote_revision_items.revision_id
      and r.business_id in (select owned_business_ids())
  ));

create policy quote_revision_items_owner_insert on public.quote_revision_items
  for insert to authenticated
  with check (exists (
    select 1 from public.quote_revisions r
    where r.id=quote_revision_items.revision_id
      and r.business_id in (select owned_business_ids())
      and r.status='draft'
  ));

create policy quote_revision_items_owner_update on public.quote_revision_items
  for update to authenticated
  using (exists (
    select 1 from public.quote_revisions r
    where r.id=quote_revision_items.revision_id
      and r.business_id in (select owned_business_ids())
      and r.status='draft'
  ))
  with check (exists (
    select 1 from public.quote_revisions r
    where r.id=quote_revision_items.revision_id
      and r.business_id in (select owned_business_ids())
      and r.status='draft'
  ));

create policy quote_revision_items_owner_delete on public.quote_revision_items
  for delete to authenticated
  using (exists (
    select 1 from public.quote_revisions r
    where r.id=quote_revision_items.revision_id
      and r.business_id in (select owned_business_ids())
      and r.status='draft'
  ));

create or replace function public.prevent_revision_history_overwrite()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' then
    raise exception 'sent and accepted revisions are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists quote_revisions_prevent_history_overwrite on public.quote_revisions;
create trigger quote_revisions_prevent_history_overwrite
before update on public.quote_revisions
for each row execute function public.prevent_revision_history_overwrite();

create or replace function public.prevent_revision_item_history_overwrite()
returns trigger
language plpgsql
as $$
declare revision_status quote_status;
begin
  select r.status into revision_status
  from public.quote_revisions r
  where r.id=coalesce(new.revision_id,old.revision_id);

  if revision_status <> 'draft' then
    raise exception 'sent and accepted revision items are immutable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists quote_revision_items_prevent_history_overwrite on public.quote_revision_items;
create trigger quote_revision_items_prevent_history_overwrite
before update or delete on public.quote_revision_items
for each row execute function public.prevent_revision_item_history_overwrite();

create or replace function public.create_quote_revision(
  p_quote_id uuid,
  p_customer_id uuid,
  p_site_address text,
  p_scope_summary text,
  p_gst_inclusive boolean,
  p_gst_rate numeric,
  p_subtotal bigint,
  p_gst_amount bigint,
  p_total bigint,
  p_valid_until timestamptz,
  p_terms text,
  p_source text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  q public.quotes%rowtype;
  r public.quote_revisions%rowtype;
  next_revision integer;
begin
  select * into q from public.quotes
  where id=p_quote_id and business_id in (select owned_business_ids());

  if q.id is null then raise exception 'quote not found'; end if;
  if q.status not in ('sent','accepted') then raise exception 'only sent or accepted quotes can be revised'; end if;

  select coalesce(max(revision_number),0)+1 into next_revision
  from public.quote_revisions where quote_id=q.id;

  insert into public.quote_revisions(
    quote_id,business_id,revision_number,customer_id,site_address,scope_summary,
    gst_inclusive,gst_rate,subtotal,gst_amount,total,valid_until,terms,source,status,created_by
  ) values (
    q.id,q.business_id,next_revision,p_customer_id,p_site_address,p_scope_summary,
    p_gst_inclusive,p_gst_rate,p_subtotal,p_gst_amount,p_total,p_valid_until,p_terms,p_source,
    'draft',auth.uid()
  ) returning * into r;

  insert into public.quote_revision_items(
    revision_id,description,quantity,unit,cost,markup,selling_price,type,notes,sort_order
  )
  select r.id,x.description,x.quantity,x.unit,x.cost,x.markup,x.selling_price,x.type::line_item_type,x.notes,x.sort_order
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) x(
    description text,quantity numeric(12,3),unit text,cost bigint,markup numeric(8,2),
    selling_price bigint,type text,notes text,sort_order integer
  );

  return jsonb_build_object('revision',to_jsonb(r),'items',coalesce((
    select jsonb_agg(to_jsonb(i) order by i.sort_order)
    from public.quote_revision_items i where i.revision_id=r.id
  ),'[]'::jsonb));
end;
$$;

-- Sending is an explicit privileged state transition after ownership is checked
-- inside the function. The function bypasses the draft-only UPDATE policy.
create or replace function public.send_quote_revision(p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.quote_revisions%rowtype;
  q public.quotes%rowtype;
begin
  select * into r from public.quote_revisions
  where id=p_revision_id and business_id in (select owned_business_ids())
  for update;
  if r.id is null then raise exception 'revision not found'; end if;
  if r.status <> 'draft' then raise exception 'only a pending revision can be sent'; end if;

  update public.quote_revisions set status='sent',sent_at=now()
  where id=r.id returning * into r;

  update public.quotes set sent_at=now() where id=r.quote_id returning * into q;
  return jsonb_build_object('revision',to_jsonb(r),'quote',to_jsonb(q));
end;
$$;

revoke all on function public.send_quote_revision(uuid) from public,anon;
grant execute on function public.send_quote_revision(uuid) to authenticated;
