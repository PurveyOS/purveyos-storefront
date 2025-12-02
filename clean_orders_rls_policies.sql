-- Drop all existing order policies and create clean ones
-- This ensures no conflicting policies

-- ORDERS TABLE
DROP POLICY IF EXISTS "Allow anonymous order creation" ON orders;
DROP POLICY IF EXISTS "Anon can insert orders" ON orders;
DROP POLICY IF EXISTS "Users can insert their tenant's orders" ON orders;
DROP POLICY IF EXISTS "Users can delete their tenant's orders" ON orders;
DROP POLICY IF EXISTS "Users can update their tenant's orders" ON orders;
DROP POLICY IF EXISTS "Users can view their tenant's orders" ON orders;
DROP POLICY IF EXISTS "Users can manage orders from their tenant" ON orders;
DROP POLICY IF EXISTS "Customers can view own orders" ON orders;
DROP POLICY IF EXISTS "Customers can view their own orders" ON orders;
DROP POLICY IF EXISTS "Allow reading orders by tenant" ON orders;

-- Simple anon insert policy for storefront
CREATE POLICY "Storefront can create paid orders"
ON orders
FOR INSERT
TO anon
WITH CHECK (
  status = 'paid' AND 
  source = 'storefront' AND
  tenant_id IS NOT NULL
);

-- Service role has full access
CREATE POLICY "Service role full access to orders"
ON orders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can manage their tenant's orders
CREATE POLICY "Authenticated users manage tenant orders"
ON orders
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
);

-- ORDER_LINES TABLE
DROP POLICY IF EXISTS "Allow anonymous order_lines creation" ON order_lines;
DROP POLICY IF EXISTS "Users can insert their tenant's order lines" ON order_lines;
DROP POLICY IF EXISTS "Users can delete their tenant's order lines" ON order_lines;
DROP POLICY IF EXISTS "Users can update their tenant's order lines" ON order_lines;
DROP POLICY IF EXISTS "Users can view their tenant's order lines" ON order_lines;
DROP POLICY IF EXISTS "Users can manage order_lines from their tenant" ON order_lines;

-- Simple anon insert for order lines
CREATE POLICY "Storefront can create order lines"
ON order_lines
FOR INSERT
TO anon
WITH CHECK (tenant_id IS NOT NULL);

-- Service role has full access
CREATE POLICY "Service role full access to order_lines"
ON order_lines
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can manage their tenant's order lines
CREATE POLICY "Authenticated users manage tenant order lines"
ON order_lines
FOR ALL
TO authenticated
USING (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  )
);
