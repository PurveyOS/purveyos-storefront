begin;

create or replace function public.assert_product_active_order_demand_available(
  p_tenant_id uuid,
  p_product_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit text;
  v_variant_size numeric;
  v_on_hand numeric := 0;
  v_active_demand numeric := 0;
begin
  if p_tenant_id is null or nullif(btrim(coalesce(p_product_id, '')), '') is null then
    return;
  end if;

  select p.unit, p.variant_size
    into v_unit, v_variant_size
  from public.products p
  where p.tenant_id = p_tenant_id
    and p.id = p_product_id
  for update;

  if not found then
    return;
  end if;

  if lower(coalesce(v_unit, '')) = 'lb' then
    select coalesce(sum(
      case
        when pb.bin_kind = 'bulk_weight' then greatest(0, coalesce(pb.qty_lbs, 0) - coalesce(pb.reserved_lbs, 0))
        else greatest(0, coalesce(pb.weight_btn, 0) * (coalesce(pb.qty, 0) - coalesce(pb.reserved_qty, 0)))
      end
    ), 0)
      into v_on_hand
    from public.package_bins pb
    where pb.tenant_id = p_tenant_id
      and pb.product_id = p_product_id;

    select coalesce(sum(
      case
        when coalesce(ol.requested_weight_lbs, 0) > 0 then coalesce(ol.requested_weight_lbs, 0) * coalesce(ol.quantity, 0)
        when coalesce(ol.weight_lbs, 0) > 0 then coalesce(ol.weight_lbs, 0)
        else coalesce(ol.bin_weight, 0) * coalesce(ol.quantity, 0)
      end
    ), 0)
      into v_active_demand
    from public.order_lines ol
    join public.orders o on o.id = ol.order_id
    where ol.tenant_id = p_tenant_id
      and ol.product_id = p_product_id
      and coalesce(ol.is_pre_order, false) = false
      and coalesce(ol.line_type, '') <> 'pack_for_you'
      and ol.reserved_at is null
      and (
        ol.selected_bins is null
        or jsonb_typeof(ol.selected_bins) <> 'array'
        or jsonb_array_length(ol.selected_bins) = 0
      )
      and o.status in ('pending', 'ready');
  else
    if v_variant_size is not null then
      select coalesce(sum(greatest(0, coalesce(pb.qty, 0) - coalesce(pb.reserved_qty, 0))), 0)
        into v_on_hand
      from public.package_bins pb
      where pb.tenant_id = p_tenant_id
        and pb.product_id = p_product_id
        and coalesce(pb.bin_kind, '') <> 'bulk_weight';
    else
      select coalesce(sum(greatest(0, coalesce(pb.qty, 0) - coalesce(pb.reserved_qty, 0))), 0)
        into v_on_hand
      from public.package_bins pb
      where pb.tenant_id = p_tenant_id
        and pb.product_id = p_product_id
        and coalesce(pb.weight_btn, 0) = 0
        and coalesce(pb.bin_kind, '') <> 'bulk_weight';
    end if;

    select coalesce(sum(coalesce(ol.quantity, 0)), 0)
      into v_active_demand
    from public.order_lines ol
    join public.orders o on o.id = ol.order_id
    where ol.tenant_id = p_tenant_id
      and ol.product_id = p_product_id
      and coalesce(ol.is_pre_order, false) = false
      and coalesce(ol.line_type, '') <> 'pack_for_you'
      and ol.reserved_at is null
      and (
        ol.selected_bins is null
        or jsonb_typeof(ol.selected_bins) <> 'array'
        or jsonb_array_length(ol.selected_bins) = 0
      )
      and o.status in ('pending', 'ready');
  end if;

  if v_active_demand > v_on_hand then
    raise exception 'out_of_stock: product % has % available and % active demand',
      p_product_id,
      v_on_hand,
      v_active_demand
      using errcode = 'P0001';
  end if;
end;
$$;

commit;