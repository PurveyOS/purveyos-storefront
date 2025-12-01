-- Add is_subscription_order column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_subscription_order BOOLEAN DEFAULT false;

COMMENT ON COLUMN orders.is_subscription_order IS 'True if this order is a subscription setup/renewal, not a one-time purchase';

-- Update existing subscription orders
UPDATE orders 
SET is_subscription_order = true 
WHERE customer_email = 'ccross41585@gmail.com' 
  AND created_at >= '2025-11-29'
  AND id IN (
    SELECT DISTINCT order_id 
    FROM order_lines 
    WHERE product_id IN (
      SELECT product_id 
      FROM subscription_products 
      WHERE is_active = true
    )
  );

-- Verify column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'is_subscription_order';

-- Show updated subscription orders
SELECT id, customer_email, is_subscription_order, created_at, total_cents
FROM orders
WHERE customer_email = 'ccross41585@gmail.com'
ORDER BY created_at DESC
LIMIT 10;
