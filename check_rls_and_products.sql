-- Check if RLS is the issue - POS might not be filtering by tenant properly

-- First, let's see ALL products regardless of tenant (as admin)
SELECT 
  'ALL Products in Database' as section,
  p.id,
  p.name,
  p.tenant_id,
  t.slug as tenant_slug,
  t.name as tenant_name
FROM products p
LEFT JOIN tenants t ON p.tenant_id = t.id
ORDER BY t.slug, p.name;

-- Check RLS policies on products table
SELECT 
  'RLS Policies on Products' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'products';

-- Check if your POS app is using a helper function for tenant filtering
SELECT 
  'Tenant Helper Functions' as section,
  routine_name,
  routine_type,
  data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%tenant%';

-- Show me what's actually happening with profiles
SELECT 
  'Profile Details' as section,
  p.*,
  u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id;

-- The issue: Your POS is probably showing ALL products because:
-- 1. RLS might be disabled on products table
-- 2. RLS policy might not be filtering by tenant_id correctly
-- 3. Your POS code might not be passing tenant_id filter in queries
