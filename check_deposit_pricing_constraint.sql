-- Check whether migration 20260725000004 is effectively applied
-- 1) Constraint existence + validation state
SELECT
  c.conname,
  c.convalidated,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'products'
  AND c.conname = 'products_deposit_pricing_mode_chk';

-- 2) Count current violating rows (should be 0 before VALIDATE)
SELECT COUNT(*) AS violating_rows
FROM public.products p
WHERE COALESCE(p.is_deposit_product, false) = true
  AND (
    CASE WHEN COALESCE(p.deposit_prod_price_per_lb, 0) > 0 THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(p.deposit_fixed_total, 0) > 0 THEN 1 ELSE 0 END
  ) <> 1;

-- 3) List violating rows (if any)
SELECT
  p.id,
  p.name,
  p.deposit_prod_price_per_lb,
  p.deposit_fixed_total,
  p.updated_at
FROM public.products p
WHERE COALESCE(p.is_deposit_product, false) = true
  AND (
    CASE WHEN COALESCE(p.deposit_prod_price_per_lb, 0) > 0 THEN 1 ELSE 0 END
    + CASE WHEN COALESCE(p.deposit_fixed_total, 0) > 0 THEN 1 ELSE 0 END
  ) <> 1
ORDER BY p.updated_at DESC
LIMIT 100;

-- 4) Optional: enforce validation now (run only after violations are fixed)
-- ALTER TABLE public.products VALIDATE CONSTRAINT products_deposit_pricing_mode_chk;
