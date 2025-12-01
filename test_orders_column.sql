-- Verify is_subscription_order column exists
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'orders' 
  AND column_name = 'is_subscription_order';

-- If empty result, add the column:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_subscription_order BOOLEAN DEFAULT false;

-- Try a simple insert test
INSERT INTO orders (
  id, tenant_id, customer_name, customer_email, 
  total_cents, source, status, is_subscription_order
) VALUES (
  gen_random_uuid(),
  '3b0f917d-4cd0-4381-b080-b80e8d77d154',
  'Test User',
  'test@example.com',
  1000,
  'test',
  'pending',
  false
);

-- Delete the test record
DELETE FROM orders WHERE customer_email = 'test@example.com';
