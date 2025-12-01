-- Enable RLS and create tenant isolation policies for POS system
-- This ensures users only see products from their own tenant

-- 1. Enable RLS on products table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 2. Create helper function to get current user's tenant_id
CREATE OR REPLACE FUNCTION user_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tenant_uuid UUID;
BEGIN
  -- Get tenant_id from profiles table for current authenticated user
  SELECT tenant_id INTO tenant_uuid
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN tenant_uuid;
END;
$$;

-- 3. Create RLS policy for SELECT (reading products)
DROP POLICY IF EXISTS "Users can view products from their tenant" ON products;
CREATE POLICY "Users can view products from their tenant"
ON products
FOR SELECT
USING (tenant_id = user_tenant_id());

-- 4. Create RLS policy for INSERT
DROP POLICY IF EXISTS "Users can insert products for their tenant" ON products;
CREATE POLICY "Users can insert products for their tenant"
ON products
FOR INSERT
WITH CHECK (tenant_id = user_tenant_id());

-- 5. Create RLS policy for UPDATE
DROP POLICY IF EXISTS "Users can update products from their tenant" ON products;
CREATE POLICY "Users can update products from their tenant"
ON products
FOR UPDATE
USING (tenant_id = user_tenant_id())
WITH CHECK (tenant_id = user_tenant_id());

-- 6. Create RLS policy for DELETE
DROP POLICY IF EXISTS "Users can delete products from their tenant" ON products;
CREATE POLICY "Users can delete products from their tenant"
ON products
FOR DELETE
USING (tenant_id = user_tenant_id());

-- 7. Also apply to package_bins (inventory packages)
ALTER TABLE package_bins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view package_bins from their tenant" ON package_bins;
CREATE POLICY "Users can view package_bins from their tenant"
ON package_bins
FOR ALL
USING (tenant_id = user_tenant_id());

-- 8. Apply to sale_lines
ALTER TABLE sale_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage sale_lines from their tenant" ON sale_lines;
CREATE POLICY "Users can manage sale_lines from their tenant"
ON sale_lines
FOR ALL
USING (tenant_id = user_tenant_id());

-- 9. Apply to sales
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage sales from their tenant" ON sales;
CREATE POLICY "Users can manage sales from their tenant"
ON sales
FOR ALL
USING (tenant_id = user_tenant_id());

-- 10. Apply to orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage orders from their tenant" ON orders;
CREATE POLICY "Users can manage orders from their tenant"
ON orders
FOR ALL
USING (tenant_id = user_tenant_id());

-- 11. Apply to order_lines
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage order_lines from their tenant" ON order_lines;
CREATE POLICY "Users can manage order_lines from their tenant"
ON order_lines
FOR ALL
USING (tenant_id = user_tenant_id());

-- Verification queries
SELECT 'RLS Status Check' as section, 
       relname as table_name, 
       relrowsecurity as rls_enabled
FROM pg_class
WHERE relname IN ('products', 'package_bins', 'sales', 'sale_lines', 'orders', 'order_lines');

SELECT 'Policy Count' as section,
       tablename,
       COUNT(*) as policy_count
FROM pg_policies
WHERE tablename IN ('products', 'package_bins', 'sales', 'sale_lines', 'orders', 'order_lines')
GROUP BY tablename;
