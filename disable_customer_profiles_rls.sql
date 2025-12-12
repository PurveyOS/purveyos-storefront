-- Disable RLS on customer_profiles for now
-- The orders/sales tables don't use RLS, so we'll match that pattern
-- Once you have proper staff user setup with tenant_id in metadata, we can re-enable it

ALTER TABLE public.customer_profiles DISABLE ROW LEVEL SECURITY;

-- Drop all RLS policies - they're not needed without RLS
DROP POLICY IF EXISTS "Allow anon insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon select own customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon update own customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to read customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to update customer_profiles" ON public.customer_profiles;

-- Drop the helper function
DROP FUNCTION IF EXISTS public.get_user_tenant_id();

-- Verify RLS is disabled
SELECT tablename, rowsecurity
FROM pg_class
JOIN pg_namespace ON pg_class.relnamespace = pg_namespace.oid
WHERE relname = 'customer_profiles' AND nspname = 'public';
