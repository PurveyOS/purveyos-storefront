-- Allow anonymous users to insert orders (for storefront checkout)
-- Only allows inserting with status 'paid' and source 'storefront'
DROP POLICY IF EXISTS "Allow anonymous order creation" ON orders;

CREATE POLICY "Allow anonymous order creation"
ON orders
FOR INSERT
TO anon
WITH CHECK (
  status = 'paid' AND 
  source = 'storefront' AND
  tenant_id IS NOT NULL
);

-- Also allow reading own orders by session
DROP POLICY IF EXISTS "Allow reading orders by tenant" ON orders;

CREATE POLICY "Allow reading orders by tenant"
ON orders
FOR SELECT
TO anon, authenticated
USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Allow anonymous users to insert order_lines
-- Only for orders that belong to a tenant
DROP POLICY IF EXISTS "Allow anonymous order_lines creation" ON order_lines;

CREATE POLICY "Allow anonymous order_lines creation"
ON order_lines
FOR INSERT
TO anon
WITH CHECK (tenant_id IS NOT NULL);
