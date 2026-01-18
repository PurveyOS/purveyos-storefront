-- Cleanup script for orphaned customer_profiles
-- Run this in Supabase SQL Editor

-- 1. Check current auth user for this email
SELECT 
  id as auth_user_id,
  email,
  created_at as auth_created_at,
  email_confirmed_at
FROM auth.users
WHERE email = 'chasecrossley@yahoo.com'
ORDER BY created_at DESC;

-- 2. Check ALL customer_profiles for this email+tenant (including orphaned ones)
SELECT 
  id as profile_user_id,
  email,
  tenant_id,
  full_name,
  created_at as profile_created_at,
  updated_at
FROM customer_profiles
WHERE email = 'chasecrossley@yahoo.com'
  AND tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- 3. Find orphaned profiles (profile exists but no matching auth.users entry)
SELECT 
  cp.id as orphaned_profile_id,
  cp.email,
  cp.tenant_id,
  cp.full_name,
  cp.created_at,
  'No matching auth user' as status
FROM customer_profiles cp
LEFT JOIN auth.users au ON cp.id = au.id
WHERE cp.email = 'chasecrossley@yahoo.com'
  AND cp.tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND au.id IS NULL;

-- 4. RECONNECT: Update orphaned profile to use current auth user ID
-- This preserves all order history and subscriptions
UPDATE customer_profiles
SET 
  id = '2b9661c3-0d36-4a06-b909-caca836ed60d',  -- Current auth user ID
  updated_at = NOW()
WHERE id = '38d8be3c-3ce1-4a74-954a-f6679ad3a320'  -- Orphaned profile ID
  AND email = 'chasecrossley@yahoo.com'
  AND tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- This will also update all related records (customer_orders, customer_subscriptions, etc.)
-- because they reference customer_profiles.id with ON UPDATE CASCADE

-- 5. Verify cleanup - should return 0 rows if successful
SELECT 
  cp.id,
  cp.email,
  cp.tenant_id,
  'Still orphaned!' as warning
FROM customer_profiles cp
LEFT JOIN auth.users au ON cp.id = au.id
WHERE cp.email = 'chasecrossley@yahoo.com'
  AND cp.tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  AND au.id IS NULL;
