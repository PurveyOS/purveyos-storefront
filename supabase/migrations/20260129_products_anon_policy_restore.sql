-- ============================================================================
-- Migration: Products Anon Policy Restore (PHASE A - Immediate Fix)
-- ============================================================================
-- Problem: Header-based RLS policies don't work with supabase-js client
-- Solution: Simple is_online=true policy for anon browsing (application layer enforces tenant isolation)
-- Timeline: This is temporary until PHASE B (Edge Function) is deployed
-- ============================================================================

BEGIN;

-- Drop ALL existing policies first (including old header-based policies)
DROP POLICY IF EXISTS "Anon: browse online products for tenant (header-scoped)" ON public.products;
DROP POLICY IF EXISTS "Anon: browse online products" ON public.products;
DROP POLICY IF EXISTS "Authenticated: browse online products for tenant (header-scoped" ON public.products;
DROP POLICY IF EXISTS "Authenticated: view products for their tenant (staff only)" ON public.products;
DROP POLICY IF EXISTS "Authenticated: view products from their tenant" ON public.products;
DROP POLICY IF EXISTS "Authenticated: insert products for their tenant" ON public.products;
DROP POLICY IF EXISTS "Authenticated: update products for their tenant" ON public.products;
DROP POLICY IF EXISTS "Authenticated: delete products for their tenant" ON public.products;

-- ============================================================================
-- Simple ANON policy: Browse online products (tenant isolation via application layer)
-- ============================================================================
-- Security model:
--   - Anonymous users see ALL online products from ALL tenants
--   - Application layer (.eq('tenant_id', tenantId)) filters to current tenant's products
--   - RLS enforces is_online=true only
--   - Tenant isolation is NOT enforced by RLS here, but by application-level tenant ID filtering
--
-- Why this approach:
--   1) Avoids expensive RLS subqueries that cause timeouts
--   2) Works reliably with supabase-js client (no custom headers needed)
--   3) Still safe because application controls which tenant's products are shown
--   4) Will be replaced by Edge Function in PHASE B for better isolation
CREATE POLICY "Anon: browse online products"
ON public.products
FOR SELECT
TO anon
USING (is_online = true);

-- ============================================================================
-- Authenticated policies: Keep user_tenant_id() checks for staff/admin
-- ============================================================================
-- These policies remain unchanged and enforce strong tenant isolation
-- via RLS for authenticated users (staff and customers)

-- Authenticated browsing (staff can see all products in their tenant for admin panel)
CREATE POLICY "Authenticated: view products from their tenant"
ON public.products
FOR SELECT
TO authenticated
USING (tenant_id = public.user_tenant_id());

-- Authenticated INSERT (staff can create products)
CREATE POLICY "Authenticated: insert products for their tenant"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (tenant_id = public.user_tenant_id());

-- Authenticated UPDATE (staff can edit products)
CREATE POLICY "Authenticated: update products for their tenant"
ON public.products
FOR UPDATE
TO authenticated
USING (tenant_id = public.user_tenant_id())
WITH CHECK (tenant_id = public.user_tenant_id());

-- Authenticated DELETE (staff can remove products)
CREATE POLICY "Authenticated: delete products for their tenant"
ON public.products
FOR DELETE
TO authenticated
USING (tenant_id = public.user_tenant_id());

-- ============================================================================
-- Ensure necessary indexes exist
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_products_tenant_online 
ON public.products (tenant_id) 
WHERE is_online = true;

CREATE INDEX IF NOT EXISTS idx_products_tenant 
ON public.products (tenant_id);

CREATE INDEX IF NOT EXISTS idx_products_is_online 
ON public.products (is_online);

-- ============================================================================
-- Verification: Show all policies on products table
-- ============================================================================
SELECT 
  policyname, 
  roles::text[] as applies_to, 
  cmd as operation
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'products'
ORDER BY policyname;

-- Expected policies:
-- 1. "Anon: browse online products" (anon, SELECT)
-- 2. "Authenticated: view products from their tenant" (authenticated, SELECT)
-- 3. "Authenticated: insert products for their tenant" (authenticated, INSERT)
-- 4. "Authenticated: update products for their tenant" (authenticated, UPDATE)
-- 5. "Authenticated: delete products for their tenant" (authenticated, DELETE)
-- 6. "Service role full access products" (service_role, ALL)

COMMIT;

-- ============================================================================
-- IMPORTANT NOTES
-- ============================================================================
--
-- SECURITY CONTEXT (Application Layer Tenant Isolation):
-- ============================================================================
-- This migration temporarily relaxes RLS on products table to fix immediate 
-- timeout issues. Tenant isolation is now enforced ONLY by the application layer:
--
-- 1. Anonymous browsing:
--    - RLS allows: is_online = true
--    - App filters: .eq('tenant_id', resolvedTenantId)
--    - Result: Users only see products from their tenant's subdomain
--
-- 2. Authenticated (staff):
--    - RLS allows: tenant_id = user_tenant_id() (strong isolation)
--    - App filters: Same as above
--    - Result: Double-filtered for safety
--
-- 3. Authenticated (customers):
--    - Same RLS as staff (they can view products)
--    - App filters by tenant
--    - Result: Customers only see products from their tenant
--
-- ============================================================================
-- TIMELINE FOR PHASE B (Edge Function Replacement):
-- ============================================================================
-- This temporary policy should be replaced in PHASE B with an Edge Function:
-- - storefront-products function will handle public browsing
-- - Will validate tenant by slug before returning products
-- - Will provide better security isolation + performance
-- - Migration: supabase/migrations/<timestamp>_storefront_products_function.sql
--
-- Until then, rely on application-layer tenant ID filtering:
-- - StorefrontRoot component resolves tenant from subdomain
-- - useStorefrontData hook receives tenant.id
-- - All queries include .eq('tenant_id', tenantId)
-- ============================================================================
