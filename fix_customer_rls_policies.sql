-- Fix customer_profiles RLS policies to allow storefront customer creation
-- This allows anonymous users to create and manage customer profiles

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow anon insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon select own customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon update own customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users full access to customer_profiles" ON public.customer_profiles;

-- Allow anonymous INSERT for any tenant (storefront will provide correct tenant_id)
CREATE POLICY "Storefront anon insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO anon
WITH CHECK (true); -- Allow all inserts, rely on application logic for tenant_id

-- Allow anonymous SELECT for customers by email+tenant (for checking existing profiles)
CREATE POLICY "Storefront anon select customer_profiles"
ON public.customer_profiles
FOR SELECT
TO anon
USING (true); -- Allow all selects for storefront lookups

-- Allow anonymous UPDATE for customers by email+tenant
CREATE POLICY "Storefront anon update customer_profiles"  
ON public.customer_profiles
FOR UPDATE
TO anon
USING (true)  -- Allow all updates
WITH CHECK (true);

-- Allow authenticated users (staff in POS) full access to customer_profiles for their tenant
CREATE POLICY "Staff select customer_profiles"
ON public.customer_profiles
FOR SELECT
TO authenticated
USING (
  -- Check if user is staff for this tenant
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
    AND u.tenant_id = customer_profiles.tenant_id
    AND u.role IN ('manager', 'admin', 'owner')
  )
);

-- Ensure RLS is enabled
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Verify policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'customer_profiles'
ORDER BY policyname;
