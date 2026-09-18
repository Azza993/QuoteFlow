alter table public.business_profile
  add column if not exists default_material_markup numeric(7,2) not null default 20;

comment on column public.business_profile.default_material_markup is
  'Default markup percentage applied to material line items when a cost is entered.';
