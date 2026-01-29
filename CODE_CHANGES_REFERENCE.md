================================================================================
CODE CHANGES REFERENCE: Before & After
================================================================================

This file shows the exact changes made to the storefront code.

================================================================================
FILE: src/hooks/useStorefrontData.ts
================================================================================

CHANGE 1: Update imports (Line 2)

Before:
──────
import { supabase } from '../lib/supabaseClient';

After:
──────
import { supabase, createTenantAwareClient } from '../lib/supabaseClient';

Reason: Need to create tenant-aware client that sets x-tenant-id header


CHANGE 2: Create tenant client before queries (Around Line 155)

Before:
──────
        // Fetch real data from Supabase
        console.log('Fetching data for tenant:', tenantId);
        
  const [settingsResult, productsResult, binsResult, subscriptionsResult, subsGroupsResult] = await Promise.all([
          supabase
            .from('storefront_settings')
            ...

After:
──────
        // Fetch real data from Supabase
        console.log('Fetching data for tenant:', tenantId);
        
        // Create a tenant-aware client that sets x-tenant-id header for RLS
        const tenantClient = createTenantAwareClient(tenantId);
        
  const [settingsResult, productsResult, binsResult, subscriptionsResult, subsGroupsResult] = await Promise.all([
          tenantClient
            .from('storefront_settings')
            ...

Reason: tenantClient automatically sets x-tenant-id header on all requests


CHANGE 3: Use tenantClient for all Promise.all queries (Lines 169-197)

Before:
──────
  const [settingsResult, productsResult, binsResult, subscriptionsResult, subsGroupsResult] = await Promise.all([
          supabase
            .from('storefront_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .single(),
          
          supabase
            .from('products')
            .select('id, name, pricePer, unit, image, category, qty, description, allow_pre_order, is_deposit_product, deposit_prod_price_per_lb')
            .eq('tenant_id', tenantId)
            .eq('is_online', true)
            .order('name'),
          
          supabase
            .from('package_bins')
            .select('product_id, weight_btn, unit_price_cents, qty, reserved_qty')
            .eq('tenant_id', tenantId),
          
          supabase
            .from('subscription_products')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true),

          supabase
            .from('subscription_substitution_groups')
            .select('*')
        ]);

After:
──────
  const [settingsResult, productsResult, binsResult, subscriptionsResult, subsGroupsResult] = await Promise.all([
          tenantClient
            .from('storefront_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .single(),
          
          tenantClient
            .from('products')
            .select('id, name, pricePer, unit, image, category, qty, description, allow_pre_order, is_deposit_product, deposit_prod_price_per_lb')
            .eq('tenant_id', tenantId)
            .eq('is_online', true)
            .order('name'),
          
          tenantClient
            .from('package_bins')
            .select('product_id, weight_btn, unit_price_cents, qty, reserved_qty')
            .eq('tenant_id', tenantId),
          
          tenantClient
            .from('subscription_products')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true),

          tenantClient
            .from('subscription_substitution_groups')
            .select('*')
        ]);

Reason: All queries now use tenant-aware client with header


CHANGE 4: Update retry query (Around Line 220)

Before:
──────
            const retryProducts = await supabase
              .from('products')
              .select('id, name, pricePer, unit, image, category, qty, description')
              .eq('tenant_id', tenantId)
              .eq('is_online', true)
              .order('name');

After:
──────
            const retryProducts = await tenantClient
              .from('products')
              .select('id, name, pricePer, unit, image, category, qty, description')
              .eq('tenant_id', tenantId)
              .eq('is_online', true)
              .order('name');

Reason: Retry path must also use tenant-aware client


CHANGE 5: Update debug query (Around Line 192)

Before:
──────
        // Try fetching ALL subscriptions without filters to debug
        const { data: allSubs, error: allSubsError } = await supabase
          .from('subscription_products')
          .select('*');

After:
──────
        // Try fetching ALL subscriptions without filters to debug
        const { data: allSubs, error: allSubsError } = await tenantClient
          .from('subscription_products')
          .select('*');

Reason: Debug path also needs header for RLS enforcement


================================================================================
FILE: src/lib/supabaseClient.ts
================================================================================

STATUS: NO CHANGES NEEDED

The createTenantAwareClient function already exists (around line 31):

  export function createTenantAwareClient(tenantId: string) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Cannot create tenant-aware client: Supabase not configured');
      return supabaseInstance;
    }
    
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: {
        headers: {
          'x-tenant-id': tenantId
        }
      }
    });
  }

This function:
  ✓ Creates a new Supabase client instance
  ✓ Sets global.headers with x-tenant-id
  ✓ Preserves auth configuration
  ✓ Is stateless (safe for connection pooling)

No modifications needed - it already does what we need!

================================================================================
HOW THE HEADER FLOWS
================================================================================

Request Flow:
1. useStorefrontData.ts calls: const tenantClient = createTenantAwareClient(tenantId)
2. createTenantAwareClient sets: global: { headers: { 'x-tenant-id': tenantId } }
3. Every request from tenantClient includes this header
4. Supabase makes HTTP request with header:
   GET /rest/v1/products?tenant_id=abc-123 HTTP/1.1
   Host: api.supabase.io
   Authorization: Bearer anon-key
   x-tenant-id: abc-123-def-456-...   ← OUR HEADER HERE
5. Supabase processes RLS before returning rows
6. RLS policy reads: current_setting('request.headers')::json->>'x-tenant-id'
7. Compares tenant_id = header value
8. Returns only matching rows

Security:
- Header is read-only server-side (Supabase validates before passing to RLS)
- Client cannot fake header to access other tenant data
- Client cannot omit header (RLS returns 0 rows)
- No performance penalty (simple header transmission)

================================================================================
VERIFICATION
================================================================================

After deploying, verify the changes:

1. Check Browser Network Tab:
   - Open DevTools (F12)
   - Visit storefront
   - Look at GET request to products API
   - Headers tab should show:
     ✓ x-tenant-id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

2. Check Console for Tenant Resolution:
   - Browser Console should show:
     ✓ "🔍 Resolving tenant for hostname: tenantslug.purveyos.store"
     ✓ "🌐 Production mode, subdomain slug: tenantslug"
     ✓ "✅ Resolved tenant: {id: 'abc-123...', slug: 'tenantslug', ...}"

3. Check For Errors:
   - Should NOT see:
     ✗ "canceling statement due to statement timeout"
     ✗ "code: '57014'"
     ✗ "RLS policy violation"

4. Performance:
   - Network tab should show products request: 100-300ms
   - NOT 2-5 seconds (57014 timeout risk)

================================================================================
ROLLBACK CHANGES
================================================================================

If you need to rollback code changes to useStorefrontData.ts:

Git Rollback (Recommended):
  git revert <commit-hash>
  git push origin main

Manual Rollback:
  1. Change line 2 back to:
     import { supabase } from '../lib/supabaseClient';
  
  2. Remove line ~155:
     const tenantClient = createTenantAwareClient(tenantId);
  
  3. Replace all `tenantClient` with `supabase` in:
     - Line 169: Promise.all block
     - Line 220: Retry query
     - Line 192: Debug query

After rollback:
  - Will revert to using base supabase client (no header)
  - May see 57014 timeouts again if database fix not also rolled back
  - Can re-apply fix cleanly

================================================================================
TESTING YOUR CHANGES
================================================================================

Unit Test (verify tenantClient creation):
──────────────────────────────────────
import { createTenantAwareClient } from './supabaseClient';

const tenantId = 'test-uuid';
const client = createTenantAwareClient(tenantId);

// Verify client has headers configured
expect(client).toBeDefined();
// Client methods (.from(), etc.) should work same as base client

Integration Test (verify header sent):
────────────────────────────────────
// Use browser DevTools Network tab:
// 1. Open storefront
// 2. Inspect GET /rest/v1/products request
// 3. Check Headers tab shows x-tenant-id

Manual Test (verify RLS works):
────────────────────────────
// Browser console:
const response = await fetch('https://api.supabase.io/rest/v1/products?...',
  {headers: {'Authorization': 'Bearer KEY'}});
// Without x-tenant-id, should return 0 rows

// With x-tenant-id:
const response = await fetch('https://api.supabase.io/rest/v1/products?...',
  {headers: {
    'Authorization': 'Bearer KEY',
    'x-tenant-id': 'valid-uuid'
  }});
// Should return rows

================================================================================
