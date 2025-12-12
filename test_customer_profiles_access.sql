-- Test customer_profiles RLS policies
-- Run this while logged in as your POS user to see what the function returns

-- Test 1: Check what tenant_id the function returns
SELECT public.get_user_tenant_id() as my_tenant_id;

-- Test 2: Check your JWT claims
SELECT auth.jwt();

-- Test 3: Try to select customer_profiles
SELECT id, tenant_id, email, full_name, phone, subscribed_to_emails, created_at, updated_at
FROM public.customer_profiles
WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
LIMIT 10;

-- Test 4: Count customer_profiles you can see with RLS
SELECT COUNT(*) as visible_count
FROM public.customer_profiles;

-- Test 5: Check all policies on the table
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;
