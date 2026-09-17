-- Fix quote item replacement so database-generated IDs are used when callers omit item IDs.
-- Keep this RPC invoker-scoped and limit direct execution to authenticated clients.

create or replace function public.replace_quote_items(
  p_quote_id uuid,
  p_items jsonb,
  p_subtotal bigint,
  p_gst_amount bigint,
  p_total bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  quote_business_id uuid;
begin
  select business_id into quote_business_id
  from public.quotes
  where id = p_quote_id;

  if quote_business_id is null then
    raise exception 'quote not found';
  end if;

  delete from public.quote_items
  where quote_id = p_quote_id;

  insert into public.quote_items(
    quote_id, description, quantity, unit, cost, markup,
    selling_price, type, notes, sort_order
  )
  select
    p_quote_id, x.description, x.quantity, x.unit, x.cost, x.markup,
    x.selling_price, x.type::line_item_type, x.notes, x.sort_order
  from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
    id uuid,
    description text,
    quantity numeric(12,3),
    unit text,
    cost bigint,
    markup numeric(8,2),
    selling_price bigint,
    type text,
    notes text,
    sort_order integer
  );

  update public.quotes
  set subtotal = p_subtotal,
      gst_amount = p_gst_amount,
      total = p_total
  where id = p_quote_id;

  return coalesce(
    (select jsonb_agg(to_jsonb(i) order by i.sort_order)
     from public.quote_items i
     where i.quote_id = p_quote_id),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.replace_quote_items(uuid, jsonb, bigint, bigint, bigint) from public, anon;
grant execute on function public.replace_quote_items(uuid, jsonb, bigint, bigint, bigint) to authenticated;
