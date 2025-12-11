-- Add RLS policy for anonymous users (storefront) to insert customer profiles
-- Anonymous users should be able to insert profiles for their tenant

CREATE POLICY "Allow anon insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO anon
WITH CHECK (
  tenant_id IS NOT NULL
);

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;
