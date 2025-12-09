-- Enable public read access to tenant_discounts table (storefront needs to load discounts)
-- This allows anonymous users to read active discounts for their tenant

-- First, ensure RLS is enabled on tenant_discounts
ALTER TABLE public.tenant_discounts ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow anyone to read active discounts for any tenant
-- (Storefront is public, so we can't restrict by auth.uid() - clients must know their tenant_id)
CREATE POLICY tenant_discounts_public_read ON public.tenant_discounts
  FOR SELECT
  USING (is_active = true);

-- Alternative if you want to restrict to authenticated users only:
-- CREATE POLICY tenant_discounts_authenticated_read ON public.tenant_discounts
--   FOR SELECT
--   TO authenticated
--   USING (true);

-- Check what policies exist
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'tenant_discounts';
