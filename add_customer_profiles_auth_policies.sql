-- Add SECURE RLS policies for authenticated users to access customer_profiles
-- This ensures proper tenant isolation - users can only see their own tenant's customers

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to update customer_profiles" ON public.customer_profiles;

-- Get the user's tenant_id from their auth metadata
-- Assumes your users have tenant_id stored in auth.users.raw_user_meta_data
DROP FUNCTION IF EXISTS public.get_user_tenant_id();

CREATE FUNCTION public.get_user_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    auth.jwt()->>'tenant_id',
    auth.jwt()->'user_metadata'->>'tenant_id'
  );
$$;

-- Allow authenticated users to read ONLY customer profiles from their tenant
CREATE POLICY "Allow authenticated users to read customer_profiles"
ON public.customer_profiles
FOR SELECT
TO authenticated
USING (
  tenant_id::text = public.get_user_tenant_id()
);

-- Allow authenticated users to insert customer profiles ONLY for their tenant
CREATE POLICY "Allow authenticated users to insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id::text = public.get_user_tenant_id()
);

-- Allow authenticated users to update customer profiles ONLY for their tenant
CREATE POLICY "Allow authenticated users to update customer_profiles"
ON public.customer_profiles
FOR UPDATE
TO authenticated
USING (
  tenant_id::text = public.get_user_tenant_id()
)
WITH CHECK (
  tenant_id::text = public.get_user_tenant_id()
);

-- Ensure RLS is enabled
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;
