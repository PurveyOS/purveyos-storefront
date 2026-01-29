-- ============================================================================
-- FIX: Products Table Statement Timeout (57014) - Comprehensive RLS Overhaul
-- ============================================================================
-- ROOT CAUSE: Multiple overlapping RLS policies with expensive subqueries
--   - "Tenant users can view their products" has: tenant_id IN (SELECT profiles...)
--   - Postgres evaluates ALL SELECT policies with OR logic
--   - Even one slow policy blocks entire request → 57014 timeout
--
-- SOLUTION: 
--   1) Drop all overlapping/slow policies
--   2) Create fast policies based on request headers (x-tenant-id)
--   3) Separate policies for anon vs authenticated
--   4) Validate header with regex to prevent casting errors
--   5) Ensure indexes exist
--
-- SECURITY MODEL:
--   - Anonymous: Browse only online products for tenant in x-tenant-id header
--   - Authenticated: Same as anon (for customers), PLUS CRUD via user_tenant_id()
--   - Staff/Admin: Full CRUD for their tenant via user_tenant_id()
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Drop all problematic/overlapping policies on products table
-- ============================================================================

-- General permissive policies (security issue)
DROP POLICY IF EXISTS "Storefront users can view products" ON public.products;
DROP POLICY IF EXISTS "Storefront users can view subscription products" ON public.products;

-- Tenant-scoped policies with expensive subqueries or broken current_setting
DROP POLICY IF EXISTS "Storefront users can view tenant products" ON public.products;
DROP POLICY IF EXISTS "Tenant users can manage their products" ON public.products;
DROP POLICY IF EXISTS "Tenant users can view their products" ON public.products;

-- Duplicate tenant_* policies
DROP POLICY IF EXISTS "tenant_select_products" ON public.products;
DROP POLICY IF EXISTS "tenant_insert_products" ON public.products;
DROP POLICY IF EXISTS "tenant_update_products" ON public.products;
DROP POLICY IF EXISTS "tenant_delete_products" ON public.products;

-- Users can * products from their tenant (duplicates)
DROP POLICY IF EXISTS "Users can view products from their tenant" ON public.products;
DROP POLICY IF EXISTS "Users can insert products for their tenant" ON public.products;
DROP POLICY IF EXISTS "Users can update products from their tenant" ON public.products;
DROP POLICY IF EXISTS "Users can delete products from their tenant" ON public.products;

-- Old authenticated-specific policies that may conflict
DROP POLICY IF EXISTS "Authenticated users can view their tenant products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can manage their tenant products" ON public.products;

-- Public/generic policies (keep service_role intact)
DROP POLICY IF EXISTS "anon_read_online_products" ON public.products;
DROP POLICY IF EXISTS "Anon can view online products" ON public.products;

-- ============================================================================
-- STEP 2: Create efficient anon policy (for anonymous storefront browsing)
-- ============================================================================
-- Anonymous users can browse ONLY online products for the tenant specified in x-tenant-id header
-- Header validation via regex prevents ::uuid casting errors and returns 0 rows if header missing

CREATE POLICY "Anon: browse online products for tenant (header-scoped)"
ON public.products
FOR SELECT
TO anon
USING (
  is_online = true
  AND (
    current_setting('request.headers', true)::json ->> 'x-tenant-id'
  ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND tenant_id = (
    (current_setting('request.headers', true)::json ->> 'x-tenant-id')::uuid
  )
);

-- ============================================================================
-- STEP 3: Create policies for authenticated users (customers + staff)
-- ============================================================================
-- Authenticated users include BOTH customers (via login) AND staff/admin
-- Customers browse products (same as anon), staff can CRUD

-- Authenticated browsing policy (for customers who are logged in)
-- Uses header like anon to allow login customers to browse without breaking UX
CREATE POLICY "Authenticated: browse online products for tenant (header-scoped)"
ON public.products
FOR SELECT
TO authenticated
USING (
  is_online = true
  AND (
    current_setting('request.headers', true)::json ->> 'x-tenant-id'
  ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND tenant_id = (
    (current_setting('request.headers', true)::json ->> 'x-tenant-id')::uuid
  )
);

-- Authenticated INSERT (for staff/admin creating products)
-- Uses user_tenant_id() to ensure they can only create in their tenant
CREATE POLICY "Authenticated: insert products for their tenant"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = public.user_tenant_id());

-- Authenticated UPDATE (for staff/admin modifying products)
CREATE POLICY "Authenticated: update products for their tenant"
ON public.products
FOR UPDATE
TO authenticated
USING (tenant_id = public.user_tenant_id())
WITH CHECK (tenant_id = public.user_tenant_id());

-- Authenticated DELETE (for staff/admin removing products)
CREATE POLICY "Authenticated: delete products for their tenant"
ON public.products
FOR DELETE
TO authenticated
USING (tenant_id = public.user_tenant_id());

-- Staff/Admin SELECT via user_tenant_id (optional, for admin dashboards)
-- Can coexist with header-based SELECT because multiple SELECT policies use OR
-- If both match, rows are returned (no filtering conflict)
CREATE POLICY "Authenticated: view products for their tenant (staff only)"
ON public.products
FOR SELECT
TO authenticated
USING (tenant_id = public.user_tenant_id());

-- ============================================================================
-- STEP 4: Ensure optimal indexes for products queries
-- ============================================================================
-- These indexes support:
--   WHERE is_online = true AND tenant_id = ? ORDER BY name
-- Composite index is more efficient than separate indexes

CREATE INDEX IF NOT EXISTS idx_products_tenant_online_name
ON public.products (tenant_id, name)
WHERE is_online = true;

-- Fallback index for queries not filtering on is_online
CREATE INDEX IF NOT EXISTS idx_products_tenant
ON public.products (tenant_id);

-- ============================================================================
-- STEP 5: Verify result - show all policies on products table
-- ============================================================================

SELECT 
  policyname, 
  roles::text[] as applies_to, 
  cmd as operation,
  LEFT(qual::text, 80) as condition
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'products'
ORDER BY policyname;

-- Expected result: 6 policies
--   1x Anon SELECT (header-based, online only)
--   2x Authenticated SELECT (header-based browsing + staff-only via user_tenant_id)
--   1x Authenticated INSERT (via user_tenant_id)
--   1x Authenticated UPDATE (via user_tenant_id)
--   1x Authenticated DELETE (via user_tenant_id)

-- ============================================================================
COMMIT;
-- ============================================================================

-- ============================================================================
-- DEPLOYMENT NOTES
-- ============================================================================
-- 1. Run this SQL in Supabase SQL Editor (or via CLI)
-- 2. Verify the final SELECT shows 6 policies (1 anon + 2 auth SELECT + 3 CRUD)
-- 3. Update frontend (see PHASE 1)
-- 4. Test as per PHASE 4 test plan
-- ============================================================================
