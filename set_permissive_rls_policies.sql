-- Enable RLS but with permissive policies (matching orders table pattern)
-- This allows authenticated users full access while keeping the table RLS-enabled

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (POS staff) to read all customer profiles
CREATE POLICY "Allow authenticated users to read all customer_profiles"
ON public.customer_profiles
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert customer profiles
CREATE POLICY "Allow authenticated users to insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update customer profiles
CREATE POLICY "Allow authenticated users to update customer_profiles"
ON public.customer_profiles
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow anonymous users (storefront) to insert their own profiles
CREATE POLICY "Allow anon insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO anon
WITH CHECK (tenant_id IS NOT NULL);

-- Allow anonymous users to read profiles (unrestricted for now, can add tenant filter later)
CREATE POLICY "Allow anon select customer_profiles"
ON public.customer_profiles
FOR SELECT
TO anon
USING (true);

-- Allow anonymous users to update profiles
CREATE POLICY "Allow anon update customer_profiles"
ON public.customer_profiles
FOR UPDATE
TO anon
USING (true)
WITH CHECK (tenant_id IS NOT NULL);

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;
