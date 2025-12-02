-- Check RLS policies on tenants table
-- Run this in Supabase SQL Editor

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
WHERE tablename = 'tenants';
