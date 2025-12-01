-- Fix RLS tenant isolation - just test if the function is working correctly

-- 1. The function already exists, so just verify it and grant permissions
GRANT EXECUTE ON FUNCTION user_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION user_tenant_id() TO anon;

-- 2. Verify the function works by testing it
-- Run this to see what tenant_id the current user gets:
SELECT 
  auth.uid() as current_user_id,
  user_tenant_id() as tenant_from_function,
  (SELECT tenant_id FROM profiles WHERE id = auth.uid()) as tenant_direct;

-- 3. Check if RLS policies exist and are using the function
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
WHERE tablename IN ('products', 'package_bins', 'sales', 'sale_lines', 'orders', 'order_lines')
ORDER BY tablename, policyname;

-- 4. The policies already exist, so skip recreation

-- 5. Test the RLS by counting products with current user's auth
SELECT 
  'Products visible to current user' as test,
  COUNT(*) as count,
  user_tenant_id() as tenant_id
FROM products;

-- 6. Verify products by tenant (as superuser to see all)
SELECT 
  'Product count by tenant' as report,
  t.slug,
  t.name,
  COUNT(p.id) as product_count
FROM tenants t
LEFT JOIN products p ON p.tenant_id = t.id
GROUP BY t.id, t.slug, t.name
ORDER BY t.slug;
