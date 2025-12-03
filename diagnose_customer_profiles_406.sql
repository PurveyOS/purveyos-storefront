-- Diagnose customer_profiles 406 error
-- Check if profile exists, RLS policies, and permissions

-- 1. Check if customer_profiles table exists and has data
SELECT 
  'Table Structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'customer_profiles'
ORDER BY ordinal_position;

-- 2. Check if the specific user profile exists
SELECT 
  'Profile Exists' as check_type,
  id,
  email,
  full_name,
  phone,
  tenant_id,
  created_at
FROM public.customer_profiles
WHERE id = '70fa725d-ae5e-415e-90af-9b8b02d2b689';

-- 3. Check RLS status
SELECT 
  'RLS Status' as check_type,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE tablename = 'customer_profiles';

-- 4. Check all RLS policies on customer_profiles
SELECT 
  'RLS Policies' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;

-- 5. Check table grants/permissions
SELECT 
  'Table Permissions' as check_type,
  grantee,
  privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public' 
  AND table_name = 'customer_profiles'
ORDER BY grantee, privilege_type;

-- 6. Check if authenticated role has access
SELECT 
  'Role Check' as check_type,
  has_table_privilege('authenticated', 'public.customer_profiles', 'SELECT') as can_select,
  has_table_privilege('authenticated', 'public.customer_profiles', 'INSERT') as can_insert,
  has_table_privilege('authenticated', 'public.customer_profiles', 'UPDATE') as can_update;
