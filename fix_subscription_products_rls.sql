-- Fix RLS on subscription_products to allow public storefront access
-- The storefront needs to read subscription products without authentication

-- Enable RLS if not already enabled
ALTER TABLE subscription_products ENABLE ROW LEVEL SECURITY;

-- Drop existing public read policy if it exists
DROP POLICY IF EXISTS "Allow public read access to active subscriptions" ON subscription_products;

-- Create policy to allow anyone to read active subscription products
-- This is safe because subscription_products only contains pricing/configuration, not sensitive customer data
CREATE POLICY "Allow public read access to active subscriptions"
ON subscription_products
FOR SELECT
USING (is_active = true);

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'subscription_products';
