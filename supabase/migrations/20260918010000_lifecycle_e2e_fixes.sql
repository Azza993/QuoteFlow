-- Lifecycle fixes discovered during live end-to-end testing.
--
-- Draft quote sending must use a controlled RPC rather than a direct client
-- status update. Revision decisions also need a controlled sent -> accepted /
-- declined transition. Authenticated lifecycle functions must be callable by
-- RLS policy expressions but not anonymously.

create or replace function public.send_quote(p_quote_id uuid)
returns public.quotes
language plpgsql
security invoker
set search_path=public
as $$
declare
  q public.quotes%rowtype;
begin
  select * into q
  from public.quotes
  where id=p_quote_id
    and business_id in (select owned_business_ids())
  for update;

  if q.id is null then raise exception 'quote not found'; end if;
  if q.status <> 'draft' then raise exception 'only draft quotes can be sent'; end if;

  perform set_config('quoteflow.lifecycle','1',true);

  update public.quotes
  set status='sent', sent_at=now()
  where id=q.id
  returning * into q;

  return q;
end;
$$;

revoke all on function public.send_quote(uuid) from public,anon;
grant execute on function public.send_quote(uuid) to authenticated;

grant execute on function public.owned_business_ids() to authenticated;
revoke execute on function public.owned_business_ids() from anon,public;

revoke execute on function public.create_quote_revision(uuid,uuid,text,text,boolean,numeric,bigint,bigint,bigint,timestamptz,text,text,jsonb) from public,anon;
grant execute on function public.create_quote_revision(uuid,uuid,text,text,boolean,numeric,bigint,bigint,bigint,timestamptz,text,text,jsonb) to authenticated;

revoke execute on function public.decide_quote(uuid,quote_status) from public,anon;
grant execute on function public.decide_quote(uuid,quote_status) to authenticated;

create or replace function public.prevent_revision_history_overwrite()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.status <> 'draft'
     and not (
       old.status = 'sent'
       and new.status in ('accepted','declined')
       and current_setting('quoteflow.lifecycle', true) = '1'
     ) then
    raise exception 'sent and accepted revisions are immutable';
  end if;
  return new;
end;
$$;
