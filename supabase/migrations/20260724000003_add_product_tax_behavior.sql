-- Add product-level tax behavior overrides for storefront tax calculations
-- Values:
--   inherit: use tenant-level charge_tax_on_online
--   taxable: always tax this product
--   exempt: never tax this product

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS tax_behavior text;

ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_tax_behavior_check;

ALTER TABLE public.products
ADD CONSTRAINT products_tax_behavior_check
CHECK (tax_behavior IN ('inherit', 'taxable', 'exempt'));

ALTER TABLE public.products
ALTER COLUMN tax_behavior SET DEFAULT 'exempt';

UPDATE public.products
SET tax_behavior = 'exempt'
WHERE tax_behavior IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_tenant_online_tax_behavior
ON public.products (tenant_id, is_online, tax_behavior);
