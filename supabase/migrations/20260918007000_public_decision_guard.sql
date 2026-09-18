-- Allow the public token decision RPC to perform the controlled quote
-- lifecycle transition without exposing a general-purpose status write.
create or replace function public.decide_quote_by_token(
  p_token text,
  p_decision quote_status
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  q public.quotes%rowtype;
  r public.quote_revisions%rowtype;
  j public.jobs%rowtype;
begin
  perform set_config('quoteflow.lifecycle','1',true);

  select * into r from public.quote_revisions
  where public_token=p_token and status='sent'
  for update;

  if r.id is not null then
    if p_decision not in ('accepted','declined') then raise exception 'invalid decision'; end if;

    update public.quote_revisions
    set status=p_decision, decided_at=now()
    where id=r.id returning * into r;

    if p_decision='accepted' then
      select * into q from public.quotes where id=r.quote_id for update;
      select * into j from public.jobs where quote_id=q.id for update;

      if j.id is null then
        insert into public.jobs(business_id,customer_id,quote_id,site_address,scope_summary)
        values(q.business_id,r.customer_id,q.id,r.site_address,r.scope_summary)
        returning * into j;
      else
        update public.jobs
        set customer_id=r.customer_id,site_address=r.site_address,scope_summary=r.scope_summary
        where id=j.id returning * into j;
      end if;

      update public.quotes
      set status='accepted', decided_at=coalesce(q.decided_at,now()), job_id=j.id
      where id=q.id;
    end if;

    return jsonb_build_object('ok',true,'revision_id',r.id,'quote_id',r.quote_id,'job_id',j.id);
  end if;

  select * into q from public.quotes
  where public_token=p_token and status='sent'
  for update;

  if q.id is null then
    return jsonb_build_object('ok',true,'already_decided',true);
  end if;

  if p_decision='accepted' then
    select * into j from public.jobs where quote_id=q.id for update;
    if j.id is null then
      insert into public.jobs(business_id,customer_id,quote_id,site_address,scope_summary)
      values(q.business_id,q.customer_id,q.id,q.site_address,q.scope_summary)
      returning * into j;
    end if;
    update public.quotes set status='accepted',decided_at=now(),job_id=j.id where id=q.id;
  else
    update public.quotes set status='declined',decided_at=now() where id=q.id;
  end if;

  return jsonb_build_object('ok',true,'quote_id',q.id,'job_id',j.id);
end;
$$;

grant execute on function public.decide_quote_by_token(text,quote_status) to anon,authenticated;
