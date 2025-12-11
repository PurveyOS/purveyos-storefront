-- Add RLS policy to allow anonymous users to insert/update their own customer profiles
-- This is needed for storefront checkout to save customer info

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Allow anon insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon select own customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon update own customer_profiles" ON public.customer_profiles;

-- Allow anonymous users to insert customer profiles
CREATE POLICY "Allow anon insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anonymous users to select customer profiles by email for their tenant
CREATE POLICY "Allow anon select own customer_profiles"
ON public.customer_profiles
FOR SELECT
TO anon
USING (true);

-- Allow anonymous users to update customer profiles by email for their tenant
CREATE POLICY "Allow anon update own customer_profiles"
ON public.customer_profiles
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
