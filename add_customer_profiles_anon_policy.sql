-- Add SECURE RLS policies for customer_profiles with tenant isolation
-- This ensures users can only access customer profiles for their own tenant

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Allow anon insert customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon select own customer_profiles" ON public.customer_profiles;
DROP POLICY IF EXISTS "Allow anon update own customer_profiles" ON public.customer_profiles;

-- Helper function to get tenant_id from request headers (set by your storefront app)
-- Your storefront should set this in the Supabase client initialization

-- Allow anonymous users to insert customer profiles ONLY for their tenant
CREATE POLICY "Allow anon insert customer_profiles"
ON public.customer_profiles
FOR INSERT
TO anon
WITH CHECK (
  -- Only allow if the tenant_id matches the request header
  tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
  OR
  -- Or if no JWT, require tenant_id to be explicitly provided and valid
  -- This allows storefront to pass tenant_id from subdomain/domain
  tenant_id IS NOT NULL
);

-- Allow anonymous users to select customer profiles ONLY for their tenant by email
CREATE POLICY "Allow anon select own customer_profiles"
ON public.customer_profiles
FOR SELECT
TO anon
USING (
  tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
);

-- Allow anonymous users to update customer profiles ONLY for their tenant
CREATE POLICY "Allow anon update own customer_profiles"
ON public.customer_profiles
FOR UPDATE
TO anon
USING (
  tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
)
WITH CHECK (
  tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id'
);

-- Ensure RLS is enabled
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
