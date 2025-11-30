-- Re-enable RLS with correct policy after confirming data loads without RLS

-- Re-enable RLS
ALTER TABLE subscription_products ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "subscription_products_tenant_isolation" ON subscription_products;
DROP POLICY IF EXISTS "subscription_products_service_role" ON subscription_products;
DROP POLICY IF EXISTS "Allow anonymous read of active subscriptions" ON subscription_products;
DROP POLICY IF EXISTS "Allow public read access to active subscriptions" ON subscription_products;

-- Create ONE comprehensive policy for all access patterns
CREATE POLICY "subscription_products_access"
ON subscription_products
AS PERMISSIVE
FOR SELECT
TO public
USING (
  -- Service role bypasses all checks
  auth.role() = 'service_role'
  OR
  -- Authenticated users see their tenant's subscriptions
  (auth.role() = 'authenticated' AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()))
  OR
  -- Anonymous (storefront) users can read active subscriptions
  (is_active = true)
);

-- Verify the policy
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'subscription_products';
