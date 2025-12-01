-- Fix the overly permissive anon policies that bypass tenant isolation

-- PROBLEM: These policies allow viewing ALL products/package_bins regardless of tenant
-- They're meant for storefront (anon users) but also apply to authenticated POS users

-- 1. Drop the overly broad anon policies on products
DROP POLICY IF EXISTS "Anon can view online products" ON products;
DROP POLICY IF EXISTS "anon_read_online_products" ON products;

-- 2. Drop the overly broad anon policies on package_bins  
DROP POLICY IF EXISTS "Anon can view online package bins" ON package_bins;
DROP POLICY IF EXISTS "anon_all_package_bins" ON package_bins;
DROP POLICY IF EXISTS "anon_select_package_bins" ON package_bins;
DROP POLICY IF EXISTS "anon_delete_package_bins" ON package_bins;
DROP POLICY IF EXISTS "anon_insert_package_bins" ON package_bins;
DROP POLICY IF EXISTS "anon_update_package_bins" ON package_bins;

-- 3. Create NEW anon policies that respect tenant isolation for storefront
-- These use app.current_tenant_id which the storefront sets based on subdomain

-- Anon users can view products from the current storefront tenant
CREATE POLICY "Storefront users can view tenant products" ON products
  FOR SELECT
  TO anon
  USING (
    is_online = true 
    AND tenant_id = COALESCE(
      (current_setting('app.current_tenant_id', true))::uuid,
      tenant_id  -- Fallback if setting not available (shouldn't happen)
    )
  );

-- Anon users can view package_bins from the current storefront tenant
CREATE POLICY "Storefront users can view tenant package_bins" ON package_bins
  FOR SELECT
  TO anon
  USING (
    tenant_id = COALESCE(
      (current_setting('app.current_tenant_id', true))::uuid,
      tenant_id  -- Fallback
    )
    AND product_id IN (
      SELECT id FROM products WHERE is_online = true
    )
  );

-- 4. Verify the fix - count policies per table
SELECT 
  tablename,
  COUNT(*) as policy_count,
  STRING_AGG(policyname, ', ' ORDER BY policyname) as policies
FROM pg_policies
WHERE tablename IN ('products', 'package_bins')
GROUP BY tablename
ORDER BY tablename;

-- 5. Show remaining product policies to verify tenant isolation
SELECT 
  policyname,
  roles,
  cmd,
  CASE 
    WHEN qual LIKE '%user_tenant_id%' THEN 'Uses user_tenant_id() ✓'
    WHEN qual LIKE '%app.current_tenant_id%' THEN 'Uses storefront tenant ✓'
    WHEN qual LIKE '%is_online%' AND qual NOT LIKE '%tenant%' THEN 'NO TENANT FILTER ⚠️'
    ELSE 'Other'
  END as filter_type
FROM pg_policies
WHERE tablename = 'products'
ORDER BY cmd, policyname;
