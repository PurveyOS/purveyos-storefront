-- RLS policies with tenant isolation using profiles table
-- This ensures each user only sees customer_profiles for their own tenant

-- Drop existing policies
DROP POLICY IF EXISTS "Allow authenticated users to read all customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow authenticated users to update customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon select customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon update customer_profiles" ON public.customer_profiles;

-- Enable RLS
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read customer_profiles only for their tenant
-- Join: auth.uid() -> profiles.id -> profiles.tenant_id -> customer_profiles.tenant_id
CREATE POLICY "Allow authenticated users to read customer_profiles"
ON public.customer_profiles
FOR SELECT
TO authenticated
USING (
  tenant_id = (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
);

-- Authenticated users can insert customer_profiles only for their tenant
CREATE POLICY "Allow authenticated users to insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
);

-- Authenticated users can update customer_profiles only for their tenant
CREATE POLICY "Allow authenticated users to update customer_profiles"
ON public.customer_profiles
FOR UPDATE
TO authenticated
USING (
  tenant_id = (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
)
WITH CHECK (
  tenant_id = (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
  )
);

-- Verify policies
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'customer_profiles'
ORDER BY policyname;
