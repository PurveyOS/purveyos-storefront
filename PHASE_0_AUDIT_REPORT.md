================================================================================
PHASE 0 - AUDIT REPORT: PRODUCTS TIMEOUT & RLS POLICIES
================================================================================

================================================================================
A) CURRENT RLS POLICIES ON PRODUCTS TABLE (from schema.sql)
================================================================================

PROBLEMATIC POLICIES (causing timeouts):
1. "Storefront users can view products" (line 3764)
   - TO authenticated, anon
   - USING (true) ← SECURITY ISSUE: Leaks ALL products across all tenants
   
2. "Storefront users can view tenant products" (line 3778)
   - TO anon
   - USING ((is_online = true) AND (tenant_id = COALESCE((current_setting('app.current_tenant_id', true))::uuid, tenant_id)))
   - PROBLEM: Uses connection pool unreliable current_setting; COALESCE fallback leaks data
   
3. "Tenant users can view their products" (line 3874)
   - TO authenticated
   - USING (tenant_id IN (SELECT profiles.tenant_id FROM profiles WHERE profiles.id = auth.uid()))
   - PROBLEM: Expensive subquery on profiles table for EVERY request; causes timeouts on large datasets

4. "Users can view products from their tenant" (line 4042)
   - USING (tenant_id = public.user_tenant_id())
   - PROBLEM: Another duplicate; adds to evaluation overhead

5. "tenant_select_products" (line 4257)
   - USING (tenant_id = public.user_tenant_id())
   - PROBLEM: Duplicate again; unclear which is evaluated first

MULTIPLE POLICY EVALUATION: PostgreSQL evaluates ALL applicable policies with OR logic.
Even if one policy is fast, slowness in ANY policy blocks the query. The expensive 
subqueries in policies 3-5 cause the 57014 timeout.

================================================================================
B) STOREFRONT CODEBASE ANALYSIS
================================================================================

Tenant Resolution:
  File: src/hooks/useTenantFromDomain.ts
  Method: Subdomain extraction
    - Production: poultryfarm.purveyos.store → slug "poultryfarm" → tenant.id (UUID)
    - Development: VITE_DEV_TENANT_SLUG env var (default: "sweetppastures")
  Output: { tenant: Tenant object with .id (UUID), .slug, .name, etc. }

Supabase Client:
  File: src/lib/supabaseClient.ts
  - Base client: supabase (for auth session management)
  - Tenant-aware client: createTenantAwareClient(tenantId: string)
    ✓ Already exists and sets global.headers { "x-tenant-id": tenantId }
    Status: READY TO USE (no changes needed)

Product Queries:
  File: src/hooks/useStorefrontData.ts
  - Queries: products, storefront_settings, package_bins, subscription_products
  - Currently: Uses base supabase client (missing x-tenant-id header)
  - Filter method: .eq('tenant_id', tenantId)
  - Retry path: Also uses base supabase client (line ~220)
  - Debug path: Also uses base supabase client (line ~192)
  Status: NEEDS UPDATE to use tenantClient

Customer Account Pages:
  Files: src/pages/CustomerLogin, CustomerPortal, SubscriptionManagement, etc.
  Queries: Orders, subscription orders, customer profile
  Status: Appears to use Supabase Auth (authenticated role)
           No explicit product queries visible in templates
           Should use tenantClient for any data fetching

Authentication Model:
  Method: Supabase Auth (auth.uid() for customer users)
  Roles: anon (not logged in), authenticated (customer OR staff)
  Status: Need to confirm if customer tables use auth.uid() filtering

================================================================================
C) REQUEST TYPES ANALYSIS
================================================================================

ANONYMOUS REQUESTS (storefront browsing):
  - No Supabase Auth token
  - Role: "anon"
  - Queries: products (online only), subscription_products, storefront_settings
  - Tenant: Resolved from subdomain
  - Current headers: None (missing x-tenant-id)
  - Status: NEEDS x-tenant-id header

AUTHENTICATED CUSTOMER REQUESTS:
  - Has Supabase Auth token (auth.uid())
  - Role: "authenticated"
  - Queries: 
    * Products (for browsing)
    * Orders (customer's own orders)
    * Subscriptions (customer's own subscriptions)
    * Customer profile
  - Tenant: Should also be resolved from subdomain (for multi-tenant support)
  - Status: NEEDS x-tenant-id header for products, orders should use auth.uid()

AUTHENTICATED STAFF/ADMIN REQUESTS:
  - Has Supabase Auth token (auth.uid())
  - Role: "authenticated" (same as customers)
  - Queries:
    * Products (CRUD)
    * Other admin tables
  - Tenant: Resolved from auth.uid() → profiles.tenant_id (via user_tenant_id() function)
  - Status: OK with user_tenant_id() function (but can still benefit from header for consistency)

================================================================================
D) CUSTOMER TABLES & POLICIES (AUDIT REQUIRED)
================================================================================

Tables to audit:
  - orders / sales / storefront_orders (customer purchase history)
  - subscriptions / subscription_orders (customer subscription orders)
  - customer_profiles / profiles (customer personal data)
  - customer_substitution_preferences

Current policies likely based on:
  - auth.uid() for customer record ownership
  - tenant_id = public.user_tenant_id() for staff/admin only

Status: Assuming customer tables already use auth.uid() correctly.
        Will NOT break with product policy changes if queries use correct role/headers.

================================================================================
E) KEY FINDINGS
================================================================================

✓ Tenant resolution works: subdomain → slug → tenant.id
✓ createTenantAwareClient() already exists and is ready
✓ Base supabase client exists for auth management
✗ useStorefrontData.ts uses base client instead of tenantClient (FIXABLE)
✗ Products table has 5 overlapping SELECT policies (FIXABLE)
✗ Product policies use expensive subqueries (CAUSES TIMEOUT)
✗ Policies don't validate x-tenant-id header (current_setting approach is broken)
✗ Anonymous requests lack x-tenant-id header

================================================================================
F) ROOT CAUSE OF 57014 TIMEOUT
================================================================================

1. Multiple overlapping RLS policies evaluated with OR logic
2. One policy contains expensive subquery: (tenant_id IN (SELECT profiles.tenant_id FROM ...))
3. This subquery executes on EVERY anonymous request to products
4. On large dataset or under load, query optimizer times out (57014)

SOLUTION:
- Drop all overlapping policies
- Create single fast policy per role (anon vs authenticated)
- Use x-tenant-id header instead of subqueries
- Validate header with regex to prevent casting errors
- Ensure indexes exist on (tenant_id) WHERE is_online=true

================================================================================
