-- Debug duplicate customer_profiles issue
-- Replace 'YOUR_EMAIL_HERE' with the actual email that's failing

-- 1. Check auth.users for this email
SELECT 
  id as user_id,
  email,
  created_at,
  confirmed_at,
  raw_user_meta_data->>'full_name' as full_name
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE';

-- 2. Check customer_profiles for this email (across ALL tenants)
SELECT 
  id,
  tenant_id,
  email,
  full_name,
  phone,
  created_at,
  updated_at
FROM customer_profiles
WHERE email = 'YOUR_EMAIL_HERE';

-- 3. Check which tenant(s) have this email
SELECT 
  cp.id as profile_id,
  cp.tenant_id,
  t.name as tenant_name,
  t.slug as tenant_slug,
  cp.email,
  cp.created_at as profile_created_at,
  au.id as auth_user_id,
  au.created_at as auth_created_at
FROM customer_profiles cp
JOIN tenants t ON cp.tenant_id = t.id
LEFT JOIN auth.users au ON cp.id = au.id
WHERE cp.email = 'YOUR_EMAIL_HERE';

-- 4. Find orphaned profiles (profile exists but no matching auth.users)
SELECT 
  cp.id as profile_id,
  cp.tenant_id,
  cp.email,
  cp.created_at,
  'ORPHANED - NO AUTH USER' as status
FROM customer_profiles cp
LEFT JOIN auth.users au ON cp.id = au.id
WHERE cp.email = 'YOUR_EMAIL_HERE'
  AND au.id IS NULL;

-- 5. Clean up orphaned profiles (UNCOMMENT TO RUN)
-- DELETE FROM customer_profiles
-- WHERE email = 'YOUR_EMAIL_HERE'
--   AND id NOT IN (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL_HERE');
