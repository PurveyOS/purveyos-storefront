-- Patch: simplify product tax behavior to taxable/exempt only.
-- Safe to run after the original tax_behavior migration.

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS tax_behavior text;

-- Normalize existing values before tightening constraint
UPDATE public.products
SET tax_behavior = 'exempt'
WHERE tax_behavior IS NULL
   OR tax_behavior = 'inherit'
   OR tax_behavior NOT IN ('taxable', 'exempt');

ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_tax_behavior_check;

ALTER TABLE public.products
ADD CONSTRAINT products_tax_behavior_check
CHECK (tax_behavior IN ('taxable', 'exempt'));

ALTER TABLE public.products
ALTER COLUMN tax_behavior SET DEFAULT 'exempt';
