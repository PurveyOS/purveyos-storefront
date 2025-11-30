-- Fix tenant isolation policy to allow anonymous access with tenant_id filter
-- The current policy blocks anonymous users completely

-- Drop the overly restrictive tenant isolation policy
DROP POLICY IF EXISTS "subscription_products_tenant_isolation" ON subscription_products;

-- Create a new policy that allows:
-- 1. Authenticated users to see their tenant's subscriptions
-- 2. Anonymous users to see active subscriptions (filtered by tenant_id in the query)
CREATE POLICY "subscription_products_tenant_isolation"
ON subscription_products
FOR SELECT
USING (
  -- Authenticated users see their tenant's data
  (auth.role() = 'authenticated' AND tenant_id = user_tenant_id())
  OR
  -- Anonymous users can see active subscriptions (they must filter by tenant_id in query)
  (auth.role() = 'anon' AND is_active = true)
);

-- Verify the updated policy
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'subscription_products' AND policyname = 'subscription_products_tenant_isolation';
