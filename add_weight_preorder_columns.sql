-- Migration: Add weight and pre-order support to order_lines table
-- This enables proper handling of custom weight entries and pre-order items

-- 1. Add weight column for custom weight entries (e.g., "10 lbs" of a product)
ALTER TABLE public.order_lines 
ADD COLUMN IF NOT EXISTS weight DECIMAL(10,2);

-- 2. Add is_pre_order flag to track pre-order items
ALTER TABLE public.order_lines 
ADD COLUMN IF NOT EXISTS is_pre_order BOOLEAN DEFAULT false;

-- 3. Add comment for documentation
COMMENT ON COLUMN public.order_lines.weight IS 'Custom weight in pounds for weight-based pricing (e.g., pre-orders or bulk items)';
COMMENT ON COLUMN public.order_lines.is_pre_order IS 'Flag indicating if this line item is a pre-order';

-- 4. Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'order_lines'
AND column_name IN ('weight', 'is_pre_order', 'bin_weight', 'unit_price_cents', 'price_per', 'quantity')
ORDER BY ordinal_position;

-- 5. Optional: Update any existing order lines if needed
-- (This is safe to run - it won't change existing data since columns are nullable)
-- UPDATE public.order_lines 
-- SET is_pre_order = false 
-- WHERE is_pre_order IS NULL;
