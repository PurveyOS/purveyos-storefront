-- TEMPORARY: Disable RLS on subscription_products to test if that's the issue
-- This will help us confirm RLS is blocking the query

-- Disable RLS temporarily
ALTER TABLE subscription_products DISABLE ROW LEVEL SECURITY;

-- Test query after disabling RLS
SELECT id, tenant_id, product_id, name, is_active
FROM subscription_products
WHERE tenant_id = '3b0f917d-4cd0-4381-b080-b80e8d77d154' 
  AND is_active = true;

-- If this returns results, we know RLS is the problem
-- If it still returns 0, something else is wrong (like the data was deleted)
