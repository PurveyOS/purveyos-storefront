-- Diagnose RLS policies for customer_profiles
-- Run this in Supabase SQL Editor to see what's blocking profile updates

-- 1. Check if RLS is enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'customer_profiles';

-- 2. Check all RLS policies on customer_profiles
SELECT 
  policyname,
  schemaname,
  tablename,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;

-- 3. Check if authenticated users can insert/update their own profiles
-- Simulate what happens during profile setup:
-- Current user ID: 2b9661c3-0d36-4a06-b909-caca836ed60d
-- This should show which policies apply

SELECT 
  policyname,
  permissive,
  CASE 
    WHEN qual IS NOT NULL THEN 'READ/SELECT policy: ' || qual
    WHEN with_check IS NOT NULL THEN 'WRITE policy: ' || with_check
    ELSE 'NO CONDITIONS'
  END as policy_condition
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;

-- 4. Test: Try to see what happens with a simple update
-- This will show if the current user can update their profile
-- Note: This is read-only diagnostic - it won't actually update anything

-- 5. Check if there are any BEFORE/AFTER triggers that might be interfering
SELECT 
  trigger_name,
  event_object_table,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'customer_profiles'
ORDER BY trigger_name;
