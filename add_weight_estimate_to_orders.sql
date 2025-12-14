-- Migration: Add weight estimate tracking to orders table
-- This enables marking orders with estimated weights that need adjustment at fulfillment

-- 1. Add is_weight_estimate flag to track orders with estimated weights
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS is_weight_estimate BOOLEAN DEFAULT false;

-- 2. Add estimated_total_cents to store the original estimate
-- (actual total_cents will be updated when weights are finalized)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS estimated_total_cents INTEGER;

-- 3. Add comments for documentation
COMMENT ON COLUMN public.orders.is_weight_estimate IS 'Flag indicating if this order contains weight-based pre-orders with estimated weights';
COMMENT ON COLUMN public.orders.estimated_total_cents IS 'Original estimated total when order was placed (for weight-based pre-orders)';

-- 4. Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'orders'
AND column_name IN ('is_weight_estimate', 'estimated_total_cents', 'deposit_amount', 'balance_due')
ORDER BY ordinal_position;
