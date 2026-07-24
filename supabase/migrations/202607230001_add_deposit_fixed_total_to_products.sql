alter table if exists public.products
  add column if not exists deposit_fixed_total numeric;

comment on column public.products.deposit_fixed_total is
  'Fixed final total for deposit products. pricePer remains the upfront deposit amount.';
