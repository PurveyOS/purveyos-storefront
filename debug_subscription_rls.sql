-- Check user_tenant_id function and test subscription_products access
-- This will help us understand why anonymous users still can't see subscriptions

-- 1. Check the user_tenant_id() function definition
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'user_tenant_id';

-- 2. Test direct query as anon role would see it
-- This simulates what the storefront sees
SELECT id, tenant_id, product_id, name, is_active
FROM subscription_products
WHERE tenant_id = '3b0f917d-4cd0-4381-b080-b80e8d77d154' 
  AND is_active = true;

-- 3. Check ALL policies on subscription_products
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'subscription_products'
ORDER BY policyname;

-- 4. Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'subscription_products';
