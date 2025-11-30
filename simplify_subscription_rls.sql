-- Remove duplicate anonymous policy and ensure tenant isolation works correctly
-- Having two SELECT policies that conflict can cause issues

-- Drop the duplicate anonymous read policy (already covered in tenant_isolation)
DROP POLICY IF EXISTS "Allow anonymous read of active subscriptions" ON subscription_products;

-- Ensure the tenant isolation policy exists with correct permissions
DROP POLICY IF EXISTS "subscription_products_tenant_isolation" ON subscription_products;

CREATE POLICY "subscription_products_tenant_isolation"
ON subscription_products
FOR ALL
USING (
  -- Service role has full access
  auth.role() = 'service_role'
  OR
  -- Authenticated users see their tenant's data
  (auth.role() = 'authenticated' AND tenant_id = user_tenant_id())
  OR
  -- Anonymous users can see active subscriptions for any tenant
  (auth.role() = 'anon' AND is_active = true)
);

-- Verify policies
SELECT policyname, cmd, roles, qual
FROM pg_policies 
WHERE tablename = 'subscription_products';
