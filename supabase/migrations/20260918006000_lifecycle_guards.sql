-- Final lifecycle guards: accepted snapshots and sent revisions cannot be
-- mutated through ordinary table writes. State changes go through explicit
-- lifecycle RPCs.

create or replace function public.prevent_quote_history_overwrite()
returns trigger
language plpgsql
as $$
begin
  if old.status <> new.status
     and current_setting('quoteflow.lifecycle', true) <> '1' then
    raise exception 'quote status is controlled by the lifecycle; use the quote workflow';
  end if;

  if old.status = 'accepted' and (
    new.customer_id is distinct from old.customer_id or
    new.site_address is distinct from old.site_address or
    new.scope_summary is distinct from old.scope_summary or
    new.gst_inclusive is distinct from old.gst_inclusive or
    new.gst_rate is distinct from old.gst_rate or
    new.subtotal is distinct from old.subtotal or
    new.gst_amount is distinct from old.gst_amount or
    new.total is distinct from old.total or
    new.valid_until is distinct from old.valid_until or
    new.terms is distinct from old.terms or
    new.source is distinct from old.source or
    new.quote_number is distinct from old.quote_number
  ) then
    raise exception 'accepted quote is immutable; create a revision instead';
  end if;

  if old.status <> 'draft' and (
    new.customer_id is distinct from old.customer_id or
    new.site_address is distinct from old.site_address or
    new.scope_summary is distinct from old.scope_summary or
    new.gst_inclusive is distinct from old.gst_inclusive or
    new.gst_rate is distinct from old.gst_rate or
    new.subtotal is distinct from old.subtotal or
    new.gst_amount is distinct from old.gst_amount or
    new.total is distinct from old.total or
    new.valid_until is distinct from old.valid_until or
    new.terms is distinct from old.terms or
    new.source is distinct from old.source or
    new.quote_number is distinct from old.quote_number
  ) then
    raise exception 'sent and accepted quote snapshots are immutable; create a revision instead';
  end if;

  return new;
end;
$$;

drop trigger if exists quotes_prevent_history_overwrite on public.quotes;
create trigger quotes_prevent_history_overwrite
before update on public.quotes
for each row execute function public.prevent_quote_history_overwrite();

create or replace function public.prevent_quote_item_history_overwrite()
returns trigger
language plpgsql
as $$
declare quote_status quote_status;
begin
  select q.status into quote_status
  from public.quotes q where q.id = coalesce(new.quote_id, old.quote_id);

  if quote_status <> 'draft' then
    raise exception 'quote line items are immutable after send; create a revision instead';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists quote_items_prevent_history_overwrite on public.quote_items;
create trigger quote_items_prevent_history_overwrite
before insert or update or delete on public.quote_items
for each row execute function public.prevent_quote_item_history_overwrite();

create or replace function public.decide_quote(
  p_quote_id uuid,
  p_decision quote_status
)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $$
declare
  q public.quotes%rowtype;
  j public.jobs%rowtype;
begin
  select * into q from public.quotes
  where id=p_quote_id and business_id in (select owned_business_ids())
  for update;

  if q.id is null then raise exception 'quote not found'; end if;
  if p_decision not in ('accepted','declined') then raise exception 'invalid decision'; end if;
  if q.status = p_decision then
    return jsonb_build_object('ok',true,'already_decided',true,'quote',to_jsonb(q));
  end if;
  if q.status <> 'sent' then raise exception 'quote is not awaiting a decision'; end if;

  perform set_config('quoteflow.lifecycle','1',true);

  if p_decision='accepted' then
    select * into j from public.jobs where quote_id=q.id for update;
    if j.id is null then
      insert into public.jobs(business_id,customer_id,quote_id,site_address,scope_summary)
      values(q.business_id,q.customer_id,q.id,q.site_address,q.scope_summary)
      returning * into j;
    end if;
    update public.quotes
    set status='accepted',decided_at=now(),job_id=j.id
    where id=q.id
    returning * into q;
  else
    update public.quotes set status='declined',decided_at=now() where id=q.id returning * into q;
  end if;

  return jsonb_build_object('ok',true,'quote',to_jsonb(q),'job',case when j.id is null then null else to_jsonb(j) end);
end;
$$;

grant execute on function public.decide_quote(uuid,quote_status) to authenticated;
revoke execute on function public.decide_quote(uuid,quote_status) from anon;

-- The public decision function uses the same lifecycle guard for the stable
-- quote path and the revision path.
revoke execute on function public.decide_quote_by_token(text,quote_status) from public;
grant execute on function public.decide_quote_by_token(text,quote_status) to anon,authenticated;
