-- Match orders table pattern: RLS enabled but NO policies (defaults to allow all)
-- This lets customer_profiles sync without needing JWT tenant_id

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow anon insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon select own customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon update own customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to read customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to update customer_profiles" ON public.customer_profiles;

-- Drop the helper function
DROP FUNCTION IF EXISTS public.get_user_tenant_id();

-- Enable RLS (it already is, but explicitly setting)
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Verify: should show RLS enabled with 0 policies
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'customer_profiles' AND schemaname = 'public';

SELECT COUNT(*) as policy_count FROM pg_policies WHERE tablename = 'customer_profiles';
