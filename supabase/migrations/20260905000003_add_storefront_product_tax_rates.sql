-- The shared tax schema, product relationship, RLS, legacy conversion, and
-- archive trigger are created by Huckster's 20260905000001 migration.
begin;

alter table public.order_lines
  add column if not exists tax_rate_id uuid,
  add column if not exists tax_rate_name text,
  add column if not exists tax_rate_basis_points integer,
  add column if not exists client_line_key text,
  add column if not exists discount_cents integer not null default 0,
  add column if not exists taxable_amount_cents integer not null default 0,
  add column if not exists tax_cents integer not null default 0;

create unique index if not exists order_lines_order_client_line_key_unique
  on public.order_lines (order_id, client_line_key)
  where client_line_key is not null;

alter table public.order_lines drop constraint if exists order_lines_tax_rate_id_fkey;
alter table public.order_lines drop constraint if exists order_lines_tenant_tax_rate_fk;
alter table public.order_lines
  add constraint order_lines_tenant_tax_rate_fk
  foreign key (tenant_id, tax_rate_id)
  references public.tax_rates (tenant_id, id)
  on update cascade on delete restrict;

alter table public.order_lines drop constraint if exists order_lines_tax_snapshot_valid;
alter table public.order_lines
  add constraint order_lines_tax_snapshot_valid
  check (
    discount_cents >= 0
    and taxable_amount_cents >= 0
    and tax_cents >= 0
    and (tax_rate_basis_points is null or tax_rate_basis_points between 0 and 10000)
  ) not valid;

comment on column public.products.tax_rate_id is
  'Tenant tax rate applied to future sales. NULL is the built-in No tax selection.';
comment on column public.order_lines.tax_rate_basis_points is
  'Immutable tax percentage snapshot where 825 basis points means 8.25%.';

create or replace function public.create_storefront_preorder_order(
  p_order jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := (p_order->>'tenant_id')::uuid;
  v_order_id uuid := coalesce(nullif(p_order->>'id', '')::uuid, gen_random_uuid());
  v_checkout_attempt_id text := nullif(p_order->>'checkout_attempt_id', '');
  v_payment_method text := lower(coalesce(p_order->>'payment_method', ''));
  v_payment_status text := coalesce(p_order->>'payment_status', 'pending');
  v_existing_order record;
  v_product record;
  v_existing_demand numeric;
  v_preorder_expires_at timestamptz;
  v_line_ids jsonb;
  v_tax_included boolean;
  v_expected_total_cents integer;
begin
  if v_tenant_id is null or v_checkout_attempt_id is null
    or p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'preorder_invalid_request' using errcode = 'P0001';
  end if;

  select id, payment_status, preorder_expires_at, stripe_payment_intent_id
  into v_existing_order
  from public.orders
  where tenant_id = v_tenant_id and checkout_attempt_id = v_checkout_attempt_id;
  if found then
    select coalesce(jsonb_agg(jsonb_build_object('line_key', client_line_key, 'id', id) order by client_line_key), '[]'::jsonb)
    into v_line_ids from public.order_lines where order_id = v_existing_order.id;
    return jsonb_build_object(
      'success', true, 'idempotent', true, 'order_id', v_existing_order.id,
      'payment_status', v_existing_order.payment_status,
      'preorder_expires_at', v_existing_order.preorder_expires_at,
      'stripe_payment_intent_id', v_existing_order.stripe_payment_intent_id,
      'lines', v_line_ids
    );
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_lines) line
    where nullif(line->>'line_key', '') is null
       or nullif(line->>'product_id', '') is null
       or coalesce(line->>'quantity', '') !~ '^[1-9][0-9]*$'
       or coalesce(line->>'line_total_cents', '') !~ '^[0-9]+$'
       or coalesce(line->>'tax_rate_basis_points', '') !~ '^[0-9]+$'
       or coalesce(line->>'discount_cents', '') !~ '^[0-9]+$'
       or coalesce(line->>'taxable_amount_cents', '') !~ '^[0-9]+$'
       or coalesce(line->>'tax_cents', '') !~ '^[0-9]+$'
  ) or exists (
    select 1 from jsonb_array_elements(p_lines) line
    group by line->>'line_key' having count(*) > 1
  ) then
    raise exception 'preorder_invalid_line_snapshot' using errcode = 'P0001';
  end if;

  if (select coalesce(sum((line->>'line_total_cents')::integer), 0) from jsonb_array_elements(p_lines) line)
      <> coalesce((p_order->>'subtotal_cents')::integer, 0)
    or (select coalesce(sum((line->>'discount_cents')::integer), 0) from jsonb_array_elements(p_lines) line)
      <> coalesce((p_order->>'discount_cents')::integer, 0)
    or (select coalesce(sum((line->>'tax_cents')::integer), 0) from jsonb_array_elements(p_lines) line)
      <> coalesce((p_order->>'tax_cents')::integer, 0) then
    raise exception 'preorder_tax_snapshot_totals_mismatch' using errcode = 'P0001';
  end if;

  select coalesce(tax_included, false) into v_tax_included
  from public.tenants where id = v_tenant_id;
  if not found then
    raise exception 'preorder_tenant_not_found' using errcode = 'P0001';
  end if;

  v_expected_total_cents := coalesce((p_order->>'subtotal_cents')::integer, 0)
    - coalesce((p_order->>'discount_cents')::integer, 0)
    + case when v_tax_included then 0 else coalesce((p_order->>'tax_cents')::integer, 0) end
    + coalesce((p_order->>'shipping_cents')::integer, 0)
    + coalesce((p_order->>'delivery_cents')::integer, 0)
    + coalesce((p_order->>'online_payment_fee_cents')::integer, 0);
  if coalesce((p_order->>'total_cents')::integer, 0) <> v_expected_total_cents then
    raise exception 'preorder_total_mismatch' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    left join public.products product
      on product.id = line->>'product_id' and product.tenant_id = v_tenant_id
    left join public.tax_rates rate
      on rate.id = nullif(line->>'tax_rate_id', '')::uuid and rate.tenant_id = v_tenant_id
    where product.id is null
       or (nullif(line->>'tax_rate_id', '') is not null and (
         rate.id is null
         or not rate.is_active
         or product.tax_rate_id is distinct from rate.id
         or line->>'tax_rate_name' is distinct from rate.name
         or (line->>'tax_rate_basis_points')::integer is distinct from rate.rate_basis_points
       ))
       or (nullif(line->>'tax_rate_id', '') is null and product.tax_rate_id is not null)
       or (nullif(line->>'tax_rate_id', '') is null and (
         coalesce(line->>'tax_rate_name', '') <> 'No tax'
         or (line->>'tax_rate_basis_points')::integer <> 0
         or (line->>'taxable_amount_cents')::integer <> 0
         or (line->>'tax_cents')::integer <> 0
       ))
       or (line->>'tax_rate_basis_points')::integer not between 0 and 10000
       or (line->>'discount_cents')::integer > (line->>'line_total_cents')::integer
       or (line->>'taxable_amount_cents')::integer
          > (line->>'line_total_cents')::integer - (line->>'discount_cents')::integer
  ) then
    raise exception 'preorder_invalid_tax_snapshot' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from (
      select
        nullif(line->>'tax_rate_id', '')::uuid as tax_rate_id,
        count(distinct line->>'tax_rate_name') as rate_name_count,
        count(distinct (line->>'tax_rate_basis_points')::integer) as rate_basis_points_count,
        max((line->>'tax_rate_basis_points')::integer) as rate_basis_points,
        sum((line->>'taxable_amount_cents')::integer) as taxable_amount_cents,
        sum((line->>'tax_cents')::integer) as tax_cents
      from jsonb_array_elements(p_lines) line
      where nullif(line->>'tax_rate_id', '') is not null
      group by nullif(line->>'tax_rate_id', '')::uuid
    ) rate_group
    where rate_name_count <> 1
       or rate_basis_points_count <> 1
       or tax_cents <> case when v_tax_included
         then taxable_amount_cents + tax_cents
           - round((taxable_amount_cents + tax_cents)::numeric * 10000 / (10000 + rate_basis_points))::integer
         else round(taxable_amount_cents::numeric * rate_basis_points / 10000)::integer
       end
  ) then
    raise exception 'preorder_tax_snapshot_calculation_mismatch' using errcode = 'P0001';
  end if;

  perform 1
  from public.product_preorder_settings settings
  where settings.tenant_id = v_tenant_id
    and settings.product_id in (select distinct line->>'product_id' from jsonb_array_elements(p_lines) line)
  order by settings.product_id for update;

  if (select count(distinct line->>'product_id') from jsonb_array_elements(p_lines) line) <>
     (select count(*) from public.product_preorder_settings settings
      where settings.tenant_id = v_tenant_id
        and settings.product_id in (select distinct line->>'product_id' from jsonb_array_elements(p_lines) line)) then
    raise exception 'preorder_not_configured' using errcode = 'P0001';
  end if;

  for v_product in
    select settings.product_id, settings.unit, settings.allocation_qty,
      settings.enabled, settings.starts_at, settings.ends_at,
      sum(case when settings.unit = 'lb'
        then nullif(line->>'requested_weight_lbs', '')::numeric
        else (line->>'quantity')::integer end) as requested_demand
    from public.product_preorder_settings settings
    join jsonb_array_elements(p_lines) line on line->>'product_id' = settings.product_id
    where settings.tenant_id = v_tenant_id
    group by settings.tenant_id, settings.product_id, settings.unit, settings.allocation_qty,
      settings.enabled, settings.starts_at, settings.ends_at
  loop
    if not v_product.enabled then
      raise exception 'preorder_not_enabled: %', v_product.product_id using errcode = 'P0001';
    end if;
    if v_product.starts_at is not null and now() < v_product.starts_at then
      raise exception 'preorder_not_open: %', v_product.product_id using errcode = 'P0001';
    end if;
    if v_product.ends_at is not null and now() >= v_product.ends_at then
      raise exception 'preorder_closed: %', v_product.product_id using errcode = 'P0001';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_lines) line
      where line->>'product_id' = v_product.product_id and (
        coalesce(line->'selected_bins', 'null'::jsonb) <> 'null'::jsonb
        or (v_product.unit = 'lb' and (
          coalesce(line->>'line_type', '') <> 'pack_for_you'
          or coalesce(nullif(line->>'requested_weight_lbs', '')::numeric, 0) <= 0
          or (line->>'quantity')::integer <> 1
        ))
        or (v_product.unit <> 'lb' and coalesce(line->>'line_type', 'exact_package') <> 'exact_package')
      )
    ) then
      raise exception 'preorder_invalid_product_line: %', v_product.product_id using errcode = 'P0001';
    end if;

    select coalesce(sum(case when v_product.unit = 'lb'
      then coalesce(lines.requested_weight_lbs, 0) else coalesce(lines.quantity, 0) end), 0)
    into v_existing_demand
    from public.order_lines lines
    join public.orders orders on orders.id = lines.order_id
      and orders.status in ('pending', 'ready', 'completed')
      and coalesce(orders.payment_status, 'pending') not in ('failed', 'refunded')
      and not (orders.preorder_expires_at is not null and orders.preorder_expires_at <= now()
        and coalesce(orders.payment_status, 'pending') = 'pending'
        and lower(coalesce(orders.payment_method, '')) = 'card')
    where lines.tenant_id = v_tenant_id and lines.product_id = v_product.product_id
      and lines.is_pre_order = true;
    if v_existing_demand + v_product.requested_demand > v_product.allocation_qty then
      raise exception 'preorder_sold_out: %', v_product.product_id using errcode = 'P0001';
    end if;
  end loop;

  v_preorder_expires_at := case when v_payment_method = 'card' and v_payment_status = 'pending'
    then now() + interval '20 minutes' else null end;

  insert into public.orders (
    id, tenant_id, checkout_attempt_id, customer_name, customer_email, customer_phone,
    note, fulfillment_method, subtotal_cents, tax_cents, shipping_cents, delivery_cents,
    online_payment_fee_cents, total_cents, total, discount_cents, payment_method,
    payment_status, source, status, preorder_expires_at, created_at, updated_at
  ) values (
    v_order_id, v_tenant_id, v_checkout_attempt_id, nullif(p_order->>'customer_name', ''),
    nullif(p_order->>'customer_email', ''), nullif(p_order->>'customer_phone', ''),
    nullif(p_order->>'note', ''), nullif(p_order->>'fulfillment_method', ''),
    coalesce((p_order->>'subtotal_cents')::integer, 0), coalesce((p_order->>'tax_cents')::integer, 0),
    coalesce((p_order->>'shipping_cents')::integer, 0), coalesce((p_order->>'delivery_cents')::integer, 0),
    coalesce((p_order->>'online_payment_fee_cents')::integer, 0), coalesce((p_order->>'total_cents')::integer, 0),
    coalesce((p_order->>'total_cents')::numeric, 0) / 100, coalesce((p_order->>'discount_cents')::integer, 0),
    nullif(v_payment_method, ''), v_payment_status, 'storefront', 'pending', v_preorder_expires_at, now(), now()
  );

  with inserted as (
    insert into public.order_lines (
      id, order_id, tenant_id, client_line_key, product_id, product_name, quantity,
      unit_price_cents, price_per, line_total_cents, requested_weight_lbs, line_type,
      is_pre_order, fulfillment_bucket, selected_bins, tax_rate_id, tax_rate_name,
      tax_rate_basis_points, discount_cents, taxable_amount_cents, tax_cents, created_at
    )
    select
      gen_random_uuid(), v_order_id, v_tenant_id, line->>'line_key', line->>'product_id',
      nullif(line->>'product_name', ''), (line->>'quantity')::integer,
      coalesce((line->>'unit_price_cents')::integer, 0), coalesce((line->>'unit_price_cents')::numeric, 0) / 100,
      (line->>'line_total_cents')::integer,
      case when coalesce(line->>'line_type', 'exact_package') = 'pack_for_you'
        then nullif(line->>'requested_weight_lbs', '')::numeric else null end,
      coalesce(line->>'line_type', 'exact_package'), true, 'LATER', null,
      nullif(line->>'tax_rate_id', '')::uuid, line->>'tax_rate_name',
      (line->>'tax_rate_basis_points')::integer, (line->>'discount_cents')::integer,
      (line->>'taxable_amount_cents')::integer, (line->>'tax_cents')::integer, now()
    from jsonb_array_elements(p_lines) line
    returning id, client_line_key
  )
  select jsonb_agg(jsonb_build_object('line_key', client_line_key, 'id', id) order by client_line_key)
  into v_line_ids from inserted;

  return jsonb_build_object(
    'success', true, 'idempotent', false, 'order_id', v_order_id,
    'preorder_expires_at', v_preorder_expires_at, 'lines', coalesce(v_line_ids, '[]'::jsonb)
  );
exception
  when unique_violation then
    select id, payment_status, preorder_expires_at, stripe_payment_intent_id
    into v_existing_order from public.orders
    where tenant_id = v_tenant_id and checkout_attempt_id = v_checkout_attempt_id;
    if found then
      select coalesce(jsonb_agg(jsonb_build_object('line_key', client_line_key, 'id', id) order by client_line_key), '[]'::jsonb)
      into v_line_ids from public.order_lines where order_id = v_existing_order.id;
      return jsonb_build_object(
        'success', true, 'idempotent', true, 'order_id', v_existing_order.id,
        'payment_status', v_existing_order.payment_status,
        'preorder_expires_at', v_existing_order.preorder_expires_at,
        'stripe_payment_intent_id', v_existing_order.stripe_payment_intent_id,
        'lines', v_line_ids
      );
    end if;
    raise;
end;
$$;

revoke all on function public.create_storefront_preorder_order(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_storefront_preorder_order(jsonb, jsonb)
  to service_role;

commit;