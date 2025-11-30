-- Check how to identify subscription orders
-- We need a way to mark orders that are subscription-related

-- Option 1: Check if order has source = 'storefront' and note contains subscription info
SELECT id, source, note, created_at 
FROM orders 
WHERE customer_email = 'ccross41585@gmail.com'
ORDER BY created_at DESC
LIMIT 10;

-- Option 2: Add a column to orders table to mark subscription orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_subscription_order BOOLEAN DEFAULT false;

COMMENT ON COLUMN orders.is_subscription_order IS 'True if this order is a subscription setup/renewal, not a one-time purchase';

-- Verify column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'is_subscription_order';
