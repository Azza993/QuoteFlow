-- QuoteFlow quote revision lifecycle.
--
-- Sent/accepted quote data is immutable. Contractor edits after send are stored
-- as pending revisions and only become customer-facing after an explicit send
-- confirmation. A revision always belongs to the same stable quote identity,
-- so acceptance updates the existing job rather than creating another one.

create table if not exists public.quote_revisions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  business_id uuid not null references public.business_profile(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  customer_id uuid null,
  site_address text,
  scope_summary text,
  gst_inclusive boolean not null,
  gst_rate numeric(8,5) not null,
  subtotal bigint not null default 0,
  gst_amount bigint not null default 0,
  total bigint not null default 0,
  valid_until timestamptz,
  terms text,
  source text not null default 'manual',
  public_token text not null default encode(gen_random_bytes(24), 'hex'),
  status quote_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  decided_at timestamptz,
  unique (quote_id, revision_number),
  unique (public_token)
);

create table if not exists public.quote_revision_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.quote_revisions(id) on delete cascade,
  description text not null default '',
  quantity numeric(12,3) not null default 1,
  unit text not null default 'each',
  cost bigint,
  markup numeric(8,2),
  selling_price bigint not null default 0,
  type line_item_type not null default 'service',
  notes text,
  sort_order integer not null default 0
);

create index if not exists quote_revisions_quote_idx
  on public.quote_revisions (quote_id, revision_number desc);
create index if not exists quote_revisions_business_idx
  on public.quote_revisions (business_id, status);
create index if not exists quote_revision_items_revision_idx
  on public.quote_revision_items (revision_id, sort_order);

alter table public.quote_revisions enable row level security;
alter table public.quote_revision_items enable row level security;

create policy quote_revisions_owner_all on public.quote_revisions
  for all to authenticated
  using (business_id in (select owned_business_ids()))
  with check (business_id in (select owned_business_ids()));

create policy quote_revision_items_owner_all on public.quote_revision_items
  for all to authenticated
  using (
    exists (
      select 1 from public.quote_revisions r
      where r.id = quote_revision_items.revision_id
        and r.business_id in (select owned_business_ids())
    )
  )
  with check (
    exists (
      select 1 from public.quote_revisions r
      where r.id = quote_revision_items.revision_id
        and r.business_id in (select owned_business_ids())
    )
  );

-- Keep the original accepted quote immutable. Non-draft quotes may only have
-- lifecycle timestamps/status changed by the controlled functions below.
create or replace function public.prevent_quote_history_overwrite()
returns trigger
language plpgsql
as $$
begin
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
  return new;
end;
$$;

drop trigger if exists quotes_prevent_history_overwrite on public.quotes;
create trigger quotes_prevent_history_overwrite
before update on public.quotes
for each row execute function public.prevent_quote_history_overwrite();

-- Revision saves are explicit and never send the revision.
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
set search_path = public
as $$
declare
  q public.quotes%rowtype;
  r public.quote_revisions%rowtype;
  next_revision integer;
begin
  select * into q from public.quotes
  where id = p_quote_id and business_id in (select owned_business_ids());

  if q.id is null then raise exception 'quote not found'; end if;
  if q.status = 'draft' then raise exception 'draft quotes do not need revisions'; end if;

  select coalesce(max(revision_number), 0) + 1 into next_revision
  from public.quote_revisions where quote_id = q.id;

  insert into public.quote_revisions(
    quote_id,business_id,revision_number,customer_id,site_address,scope_summary,
    gst_inclusive,gst_rate,subtotal,gst_amount,total,valid_until,terms,source,
    status,created_by
  ) values (
    q.id,q.business_id,next_revision,p_customer_id,p_site_address,p_scope_summary,
    p_gst_inclusive,p_gst_rate,p_subtotal,p_gst_amount,p_total,p_valid_until,p_terms,
    p_source,'draft',auth.uid()
  ) returning * into r;

  insert into public.quote_revision_items(
    revision_id,description,quantity,unit,cost,markup,selling_price,type,notes,sort_order
  )
  select r.id,x.description,x.quantity,x.unit,x.cost,x.markup,x.selling_price,
         x.type::line_item_type,x.notes,x.sort_order
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) x(
    description text, quantity numeric(12,3), unit text, cost bigint,
    markup numeric(8,2), selling_price bigint, type text, notes text, sort_order integer
  );

  return jsonb_build_object('revision', to_jsonb(r), 'items', coalesce((
    select jsonb_agg(to_jsonb(i) order by i.sort_order)
    from public.quote_revision_items i where i.revision_id=r.id
  ), '[]'::jsonb));
end;
$$;

-- Explicit send confirmation is the only way a pending revision becomes live.
create or replace function public.send_quote_revision(p_revision_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
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

  update public.quote_revisions
  set status='sent', sent_at=now()
  where id=r.id
  returning * into r;

  update public.quotes
  set sent_at=now()
  where id=r.quote_id
  returning * into q;

  return jsonb_build_object('revision',to_jsonb(r),'quote',to_jsonb(q));
end;
$$;

-- Customer decision on either the original quote or a revision. Revision
-- acceptance updates the one existing job tied to the stable quote id.
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
  select * into r from public.quote_revisions
  where public_token=p_token and status='sent'
  for update;

  if r.id is not null then
    if p_decision not in ('accepted','declined') then
      raise exception 'invalid decision';
    end if;

    update public.quote_revisions
    set status=p_decision, decided_at=now()
    where id=r.id
    returning * into r;

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
        where id=j.id
        returning * into j;
      end if;

      -- The stable quote records that its customer-facing lifecycle has an
      -- accepted outcome, while its original snapshot remains protected.
      update public.quotes set status='accepted', decided_at=coalesce(q.decided_at,now()), job_id=j.id
      where id=q.id;
    end if;

    return jsonb_build_object('ok',true,'revision_id',r.id,'quote_id',r.quote_id,'job_id',j.id);
  end if;

  select * into q from public.quotes
  where public_token=p_token and status='sent'
  for update;

  if q.id is null then
    -- Idempotent repeat of an already-decided public link.
    select id, quote_id into r from public.quote_revisions
    where public_token=p_token and status in ('accepted','declined');
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

-- Public reads now support both the original quote token and revision tokens.
create or replace function public.public_quote(token text)
returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(
    (
      select jsonb_build_object(
        'quote', jsonb_build_object(
          'id',r.quote_id,'business_id',r.business_id,'customer_id',r.customer_id,
          'job_id',null,'quote_number',q.quote_number,'status',r.status,
          'site_address',r.site_address,'scope_summary',r.scope_summary,
          'gst_inclusive',r.gst_inclusive,'gst_rate',r.gst_rate,
          'subtotal',r.subtotal,'gst_amount',r.gst_amount,'total',r.total,
          'valid_until',r.valid_until,'terms',r.terms,'source',r.source,
          'public_token',null,'created_at',r.created_at,'sent_at',r.sent_at,'decided_at',r.decided_at
        ),
        'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order)
          from public.quote_revision_items i where i.revision_id=r.id),'[]'::jsonb),
        'customer',case when c.id is null then null else jsonb_build_object(
          'id',c.id,'business_id',c.business_id,'name',c.name,'phone',null,'email',null,
          'address',null,'notes',null,'created_at',c.created_at) end,
        'business',to_jsonb(b)-'owner_id'
      )
      from public.quote_revisions r
      join public.quotes q on q.id=r.quote_id
      join public.business_profile b on b.id=r.business_id
      left join public.customers c on c.id=r.customer_id
      where r.public_token=token and r.status in ('sent','accepted','declined')
    ),
    (
      select jsonb_build_object(
        'quote',to_jsonb(q)-'public_token',
        'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order)
          from public.quote_items i where i.quote_id=q.id),'[]'::jsonb),
        'customer',case when c.id is null then null else jsonb_build_object(
          'id',c.id,'business_id',c.business_id,'name',c.name,'phone',null,'email',null,
          'address',null,'notes',null,'created_at',c.created_at) end,
        'business',to_jsonb(b)-'owner_id'
      )
      from public.quotes q
      join public.business_profile b on b.id=q.business_id
      left join public.customers c on c.id=q.customer_id
      where q.public_token=token and q.status in ('sent','accepted','declined','expired')
    )
  );
$$;

revoke all on function public.decide_public_quote(text,text) from anon, authenticated;

create or replace function public.decide_public_quote(token text, decision text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if decision not in ('accepted','declined') then
    return jsonb_build_object('ok',false,'reason','invalid_decision');
  end if;
  return public.decide_quote_by_token(token,decision::quote_status);
exception when others then
  return jsonb_build_object('ok',false,'reason','not_open');
end;
$$;

grant execute on function public.public_quote(text) to anon, authenticated;
grant execute on function public.decide_public_quote(text,text) to anon, authenticated;
grant execute on function public.create_quote_revision(
 uuid,uuid,text,text,boolean,numeric,bigint,bigint,bigint,timestamptz,text,text,jsonb
) to authenticated;
grant execute on function public.send_quote_revision(uuid) to authenticated;
grant execute on function public.decide_quote_by_token(text,quote_status) to anon,authenticated;
