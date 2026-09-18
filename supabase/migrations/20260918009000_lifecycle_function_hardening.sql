-- Harden lifecycle trigger search paths and avoid unnecessary SECURITY DEFINER
-- privileges for the authenticated revised-send transition.

create or replace function public.prevent_quote_history_overwrite()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.status <> new.status
     and current_setting('quoteflow.lifecycle', true) <> '1' then
    raise exception 'quote status is controlled by the lifecycle; use the quote workflow';
  end if;
  if old.status = 'accepted' and (
    new.customer_id is distinct from old.customer_id or new.site_address is distinct from old.site_address or
    new.scope_summary is distinct from old.scope_summary or new.gst_inclusive is distinct from old.gst_inclusive or
    new.gst_rate is distinct from old.gst_rate or new.subtotal is distinct from old.subtotal or
    new.gst_amount is distinct from old.gst_amount or new.total is distinct from old.total or
    new.valid_until is distinct from old.valid_until or new.terms is distinct from old.terms or
    new.source is distinct from old.source or new.quote_number is distinct from old.quote_number
  ) then raise exception 'accepted quote is immutable; create a revision instead'; end if;
  if old.status <> 'draft' and (
    new.customer_id is distinct from old.customer_id or new.site_address is distinct from old.site_address or
    new.scope_summary is distinct from old.scope_summary or new.gst_inclusive is distinct from old.gst_inclusive or
    new.gst_rate is distinct from old.gst_rate or new.subtotal is distinct from old.subtotal or
    new.gst_amount is distinct from old.gst_amount or new.total is distinct from old.total or
    new.valid_until is distinct from old.valid_until or new.terms is distinct from old.terms or
    new.source is distinct from old.source or new.quote_number is distinct from old.quote_number
  ) then raise exception 'sent and accepted quote snapshots are immutable; create a revision instead'; end if;
  return new;
end;
$$;

create or replace function public.prevent_quote_item_history_overwrite()
returns trigger
set search_path=public
language plpgsql
as $$
declare quote_status quote_status;
begin
  select q.status into quote_status from public.quotes q where q.id=coalesce(new.quote_id,old.quote_id);
  if quote_status <> 'draft' then raise exception 'quote line items are immutable after send; create a revision instead'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.prevent_revision_history_overwrite()
returns trigger
set search_path=public
language plpgsql
as $$
begin
  if old.status <> 'draft' then raise exception 'sent and accepted revisions are immutable'; end if;
  return new;
end;
$$;

create or replace function public.prevent_revision_item_history_overwrite()
returns trigger
set search_path=public
language plpgsql
as $$
declare revision_status quote_status;
begin
  select r.status into revision_status from public.quote_revisions r where r.id=coalesce(new.revision_id,old.revision_id);
  if revision_status <> 'draft' then raise exception 'sent and accepted revision items are immutable'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

drop policy if exists quote_revisions_owner_update on public.quote_revisions;
create policy quote_revisions_owner_update on public.quote_revisions
  for update to authenticated
  using (business_id in (select owned_business_ids()) and status='draft')
  with check (
    business_id in (select owned_business_ids())
    and (
      status='draft'
      or (status='sent' and current_setting('quoteflow.lifecycle',true)='1')
    )
  );

create or replace function public.send_quote_revision(p_revision_id uuid)
returns jsonb
language plpgsql
security invoker
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

  perform set_config('quoteflow.lifecycle','1',true);
  update public.quote_revisions set status='sent',sent_at=now()
  where id=r.id returning * into r;
  update public.quotes set sent_at=now() where id=r.quote_id returning * into q;
  return jsonb_build_object('revision',to_jsonb(r),'quote',to_jsonb(q));
end;
$$;

revoke all on function public.send_quote_revision(uuid) from public,anon;
grant execute on function public.send_quote_revision(uuid) to authenticated;
