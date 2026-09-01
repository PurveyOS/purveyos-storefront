-- Storefront inventory reconciliation
-- Run in Supabase SQL Editor. Replace the tenant UUID before execution.
-- Shows products that have positive effective package availability but whose
-- legacy storefront calculation can reduce the item to zero.

with effective_availability as (
  select
    tenant_id,
    product_id,
    sum(greatest(coalesce(effective_available_qty, 0), 0)) as available_packages,
    sum(greatest(coalesce(effective_available_lbs, 0), 0)) as available_bulk_lbs,
    sum(
      case
        when bin_kind = 'bulk_weight' then greatest(coalesce(effective_available_lbs, 0), 0)
        else greatest(coalesce(effective_available_qty, 0), 0) * coalesce(weight_btn, 0)
      end
    ) as effective_weight_lbs,
    sum(greatest(coalesce(qty, 0) - coalesce(reserved_qty, 0), 0)) as legacy_local_available_qty,
    sum(
      case
        when bin_kind = 'bulk_weight' then greatest(coalesce(qty_lbs, 0) - coalesce(reserved_lbs, 0), 0)
        else greatest(coalesce(qty, 0) - coalesce(reserved_qty, 0), 0) * coalesce(weight_btn, 0)
      end
    ) as legacy_local_available_lbs,
    sum(greatest(coalesce(reserved_qty, 0), 0) * coalesce(weight_btn, 0)) as local_reserved_package_lbs
  from public.package_bin_availability_v
  where tenant_id = 'REPLACE_WITH_TENANT_UUID'::uuid
  group by tenant_id, product_id
),
active_order_demand as (
  select
    ol.tenant_id,
    ol.product_id,
    sum(greatest(coalesce(ol.quantity, 0), 0)) as active_order_qty,
    sum(
      case
        when coalesce(ol.requested_weight_lbs, 0) > 0
          then coalesce(ol.requested_weight_lbs, 0) * coalesce(ol.quantity, 0)
        when coalesce(ol.weight_lbs, 0) > 0 then coalesce(ol.weight_lbs, 0)
        else coalesce(ol.bin_weight, 0) * coalesce(ol.quantity, 0)
      end
    ) as active_order_lbs
  from public.order_lines ol
  join public.orders o on o.id = ol.order_id
  where ol.tenant_id = 'REPLACE_WITH_TENANT_UUID'::uuid
    and o.status in ('pending', 'ready')
    and coalesce(ol.is_pre_order, false) = false
    and coalesce(ol.line_type, '') <> 'pack_for_you'
  group by ol.tenant_id, ol.product_id
)
select
  p.id as product_id,
  p.name,
  p.unit,
  ea.available_packages,
  ea.available_bulk_lbs,
  ea.effective_weight_lbs,
  coalesce(p.reserved_weight_lbs, 0) as product_reserved_lbs,
  coalesce(aod.active_order_qty, 0) as active_order_qty,
  coalesce(aod.active_order_lbs, 0) as active_order_lbs,
  case
    when lower(coalesce(p.unit, '')) = 'lb'
      then greatest(
        0,
        ea.legacy_local_available_lbs
          - coalesce(p.reserved_weight_lbs, 0)
          - greatest(0, coalesce(aod.active_order_lbs, 0) - ea.local_reserved_package_lbs)
      )
    else greatest(0, ea.legacy_local_available_qty - coalesce(aod.active_order_qty, 0))
  end as legacy_storefront_stock,
  case
    when lower(coalesce(p.unit, '')) = 'lb'
      and ea.effective_weight_lbs > 0
      and greatest(
        0,
        ea.legacy_local_available_lbs
          - coalesce(p.reserved_weight_lbs, 0)
          - greatest(0, coalesce(aod.active_order_lbs, 0) - ea.local_reserved_package_lbs)
      ) <= 0
      then 'LEGACY_STOREFRONT_WOULD_SHOW_SOLD_OUT'
    when lower(coalesce(p.unit, '')) <> 'lb'
      and ea.available_packages > 0
      and greatest(0, ea.legacy_local_available_qty - coalesce(aod.active_order_qty, 0)) <= 0
      then 'LEGACY_STOREFRONT_WOULD_SHOW_SOLD_OUT'
    else 'CHECK'
  end as diagnosis
from public.products p
join effective_availability ea
  on ea.tenant_id = p.tenant_id
 and ea.product_id = p.id
left join active_order_demand aod
  on aod.tenant_id = p.tenant_id
 and aod.product_id = p.id
where p.tenant_id = 'REPLACE_WITH_TENANT_UUID'::uuid
  and p.is_online = true
  and (
    (
      lower(coalesce(p.unit, '')) = 'lb'
      and ea.effective_weight_lbs > 0
      and greatest(
        0,
        ea.legacy_local_available_lbs
          - coalesce(p.reserved_weight_lbs, 0)
          - greatest(0, coalesce(aod.active_order_lbs, 0) - ea.local_reserved_package_lbs)
      ) <= 0
    )
    or (
      lower(coalesce(p.unit, '')) <> 'lb'
      and ea.available_packages > 0
      and greatest(0, ea.legacy_local_available_qty - coalesce(aod.active_order_qty, 0)) <= 0
    )
  )
order by p.name;
