-- Security hardening for production RPCs.
-- Internal SECURITY DEFINER helpers must not be directly callable through PostgREST.

alter function public.prevent_accepted_quote_delete() set search_path = public;

revoke all on function public.allocate_quote_number(uuid) from anon, authenticated;
revoke all on function public.assign_quote_number() from anon, authenticated;
revoke all on function public.handle_new_auth_user() from anon, authenticated;
revoke all on function public.owned_business_ids() from anon;

-- These two functions are intentionally public: the first reads a single quote
-- by opaque token and the second accepts/declines that quote.
grant execute on function public.public_quote(text) to anon, authenticated;
grant execute on function public.decide_public_quote(text, text) to anon, authenticated;

-- The quote-number counter is an internal implementation table. RLS is enabled
-- as defence in depth; the trigger's SECURITY DEFINER function is the only path
-- that needs to read/write it.
alter table public.quote_number_counters enable row level security;

-- No direct client policies are intentionally provided.
