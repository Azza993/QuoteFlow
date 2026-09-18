-- Production database performance hardening.
-- Cover foreign keys used by joins, ownership checks and cascading operations.

create index if not exists business_profile_owner_id_idx
  on public.business_profile(owner_id);

create index if not exists follow_ups_quote_id_idx
  on public.follow_ups(quote_id);

create index if not exists jobs_customer_business_idx
  on public.jobs(customer_id, business_id);

create index if not exists quotes_customer_business_idx
  on public.quotes(customer_id, business_id);

create index if not exists quotes_job_id_idx
  on public.quotes(job_id);

-- Evaluate auth.uid() once per statement rather than once per row.
drop policy if exists business_owner_all on public.business_profile;
create policy business_owner_all
  on public.business_profile
  for all
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
