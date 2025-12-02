-- Allow anonymous users to insert orders (for storefront checkout)
DROP POLICY IF EXISTS "Allow anonymous order creation" ON orders;

CREATE POLICY "Allow anonymous order creation"
ON orders
FOR INSERT
TO anon
WITH CHECK (true);

-- Also allow reading own orders by session
DROP POLICY IF EXISTS "Allow reading orders by tenant" ON orders;

CREATE POLICY "Allow reading orders by tenant"
ON orders
FOR SELECT
TO anon, authenticated
USING (tenant_id::text = current_setting('app.current_tenant_id', true));
