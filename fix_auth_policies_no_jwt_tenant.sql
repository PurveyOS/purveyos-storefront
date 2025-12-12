-- Fix authenticated user RLS policy to restrict by tenant_id stored in user metadata
-- This ensures each tenant only sees their own customers

-- Drop the old function and policies
DROP FUNCTION IF EXISTS public.get_user_tenant_id();
DROP POLICY IF EXISTS "Allow authenticated users to read customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to update customer_profiles" ON public.customer_profiles;

-- Get tenant_id from user's metadata (stored when account was created)
CREATE FUNCTION public.get_user_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt()->'user_metadata'->>'tenant_id'),
    (auth.jwt()->'app_metadata'->>'tenant_id')
  );
$$;

-- Allow authenticated users to read ONLY their own tenant's customer_profiles
CREATE POLICY "Allow authenticated users to read customer_profiles"
ON public.customer_profiles
FOR SELECT
TO authenticated
USING (
  tenant_id::text = public.get_user_tenant_id()
);

-- Allow authenticated users to insert customer_profiles ONLY for their tenant
CREATE POLICY "Allow authenticated users to insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id::text = public.get_user_tenant_id()
);

-- Allow authenticated users to update customer_profiles ONLY for their tenant
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

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;
