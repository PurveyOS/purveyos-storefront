-- Check RLS configuration on core tables

-- 1. Check if RLS is enabled on products table
SELECT 
  'RLS Enabled on Products' as check_name,
  relname as table_name,
  relrowsecurity as rls_enabled
FROM pg_class
WHERE relname = 'products';

-- 2. Get all RLS policies on products
SELECT 
  'Products RLS Policies' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE tablename = 'products';

-- 3. Check if tenant helper function exists
SELECT 
  'Tenant Helper Function' as section,
  routine_name,
  routine_type,
  routine_schema,
  data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_name LIKE '%tenant%' OR routine_name LIKE '%user_tenant%')
ORDER BY routine_name;

-- 4. Check profiles table structure (links users to tenants)
SELECT 
  'Profiles Table Structure' as section,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 5. Sample product tenant assignments
SELECT 
  'Sample Product Assignments' as section,
  p.id,
  p.name,
  p.tenant_id,
  t.slug as tenant_slug,
  t.name as tenant_name
FROM products p
LEFT JOIN tenants t ON p.tenant_id = t.id
ORDER BY t.slug, p.name
LIMIT 20;
