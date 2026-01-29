================================================================================
COMPREHENSIVE DEPLOYMENT GUIDE: Fix Products Timeout (57014)
================================================================================

This guide covers the complete solution for statement timeouts when loading 
products on the storefront. The fix involves database RLS optimization and 
frontend code updates.

================================================================================
MODIFIED FILES SUMMARY
================================================================================

DATABASE (Supabase):
  - fix_products_timeout.sql (NEW)
    * Drops 15+ overlapping RLS policies
    * Creates 5 new optimized policies
    * Adds 3 supporting indexes
    * Ready to apply via Supabase SQL Editor

FRONTEND (purveyos-storefront):
  - src/hooks/useStorefrontData.ts (UPDATED)
    * Line 2: Import createTenantAwareClient
    * Line 155: Create tenantClient with x-tenant-id header
    * Line 169-197: Use tenantClient for all queries
    * Line 220: Use tenantClient in retry path
    * Line 192: Use tenantClient in debug path

  - src/lib/supabaseClient.ts
    * NO CHANGES NEEDED (createTenantAwareClient already exists)

DOCUMENTATION:
  - PHASE_0_AUDIT_REPORT.md (NEW)
    * Audit findings from schema analysis
    * Current vs desired state
    * Security model documentation

================================================================================
DEPLOYMENT ORDER (CRITICAL)
================================================================================

⚠️  IMPORTANT: Do this in order. Database first, then frontend.

1. DEPLOY: Database RLS Fix
   ├─ Run fix_products_timeout.sql in Supabase SQL Editor
   ├─ Verify final SELECT shows 5 policies (check file lines 144-150)
   └─ Wait 30 seconds for changes to propagate

2. BUILD: Updated Frontend Code
   ├─ Changes already applied to useStorefrontData.ts
   ├─ Run: npm run build
   └─ Verify build succeeds

3. DEPLOY: Frontend to Cloudflare Pages
   ├─ Push code to Git
   ├─ Trigger Cloudflare Pages build (auto via Git hook)
   └─ Wait for deployment complete

4. TEST: Smoke Tests (Critical - see below)
   ├─ Verify anonymous browsing works
   ├─ Verify logged-in customers can browse
   ├─ Verify no 57014 errors in logs
   └─ Performance benchmark (should be <500ms)

================================================================================
STEP 1: DEPLOY DATABASE RLS FIX
================================================================================

Option A: Via Supabase Web Dashboard (Recommended)
──────────────────────────────────────────────────
1. Login to Supabase project dashboard
2. Navigate to: SQL Editor
3. Create new query
4. Copy entire contents of: c:\dev\purveyos-storefront\fix_products_timeout.sql
5. Paste into SQL Editor
6. Click "Run" button
7. Verify success message and check results

Expected output:
  ┌─ policyname ─┬─ applies_to ─┬─ operation ─┬─ condition ─┐
  │ 5 rows       │ anon/auth    │ SELECT/... │ (fast)      │
  └───────────────┴──────────────┴────────────┴─────────────┘

Option B: Via Supabase CLI
──────────────────────────
cd c:\dev\purveyos-storefront
npx supabase db execute --file fix_products_timeout.sql --db-url "YOUR_DB_URL"

Option C: Via psql directly
──────────────────────────
psql "YOUR_CONNECTION_STRING" -f fix_products_timeout.sql


VERIFICATION QUERY (run after deployment):
────────────────────────────────────────────
SELECT 
  policyname, 
  roles::text[], 
  cmd,
  LEFT(qual::text, 60)
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'products'
ORDER BY policyname;

Expected 5 policies:
  ✓ Anon: browse online products for tenant (header-scoped)
  ✓ Authenticated: browse online products for tenant (header-scoped)
  ✓ Authenticated: delete products for their tenant
  ✓ Authenticated: insert products for their tenant
  ✓ Authenticated: update products for their tenant
  ✓ Authenticated: view products for their tenant (staff only)

================================================================================
STEP 2: BUILD FRONTEND
================================================================================

The frontend code changes are already applied. Verify and build:

cd c:\dev\purveyos-storefront

# Verify changes applied
git diff src/hooks/useStorefrontData.ts
# Should show: import createTenantAwareClient and tenantClient usage

# Build
npm run build

# Verify build succeeds (no errors)
# Output should be in: dist/

================================================================================
STEP 3: DEPLOY FRONTEND
================================================================================

Option A: Git Push (Automatic via Cloudflare Pages)
───────────────────────────────────────────────────
cd c:\dev\purveyos-storefront

git add src/hooks/useStorefrontData.ts
git commit -m "Fix: Use tenant-aware client with x-tenant-id header for RLS

- Import createTenantAwareClient from supabaseClient
- Create tenantClient with tenant ID from useTenantFromDomain
- Replace all supabase.from() calls with tenantClient.from()
- Ensures x-tenant-id header sent on all product queries
- Fixes RLS policy evaluation and eliminates 57014 timeout

Related to: products table RLS optimization"

git push origin main

# Cloudflare Pages will auto-trigger build and deploy
# Monitor at: https://dash.cloudflare.com

Option B: Manual Deployment
────────────────────────────
# After successful build
npm run build

# Deploy dist/ folder to your hosting
# For Cloudflare Pages: Upload via dashboard or use Wrangler
npx wrangler pages deploy dist/

================================================================================
STEP 4: SMOKE TESTS (CRITICAL)
================================================================================

Test 1: Anonymous Storefront Browsing
──────────────────────────────────────
Steps:
  1. Open browser (private/incognito window, no cookies)
  2. Visit: https://tenantslug.purveyos.store/
  3. Observe storefront loads
  4. Products visible and fast (<1s)
  5. No 57014 errors in browser console or server logs

Expected:
  ✓ Products load from correct tenant only
  ✓ No error messages
  ✓ No timeouts

Test 2: Cross-Tenant Isolation
───────────────────────────────
Steps:
  1. Visit: https://tenant-a.purveyos.store/
  2. Note products visible
  3. Open another tab: https://tenant-b.purveyos.store/
  4. Note DIFFERENT products
  5. Switch back to tenant-a tab - verify products unchanged

Expected:
  ✓ Each tenant sees only their own products
  ✓ No cross-tenant data leakage

Test 3: Missing Header Behavior
────────────────────────────────
Steps:
  1. Open browser dev tools (F12)
  2. Go to Console tab
  3. Run (simulate direct API call without header):
     fetch('https://api.supabase.io/rest/v1/products?tenant_id=...', 
           {headers: {'Authorization': 'Bearer ANON_KEY'}})
  4. Observe response

Expected:
  ✓ 0 rows returned (not error)
  ✓ Silent graceful denial

Test 4: Logged-in Customer Browsing
────────────────────────────────────
Steps:
  1. Visit: https://tenantslug.purveyos.store/
  2. Click "Login"
  3. Login with valid customer account
  4. Verify redirects to /account or storefront
  5. Visit /product page (if exists)
  6. Products load normally

Expected:
  ✓ Logged-in users can browse products
  ✓ Can see purchase history
  ✓ No 57014 errors

Test 5: Staff/Admin Product Management
───────────────────────────────────────
Steps:
  1. Login as staff/admin (different endpoint, if exists)
  2. Navigate to product management
  3. View/create/update/delete products
  4. Verify operations succeed
  5. Verify cannot edit another tenant's products

Expected:
  ✓ Staff can manage products for their tenant
  ✓ Cross-tenant edits fail at RLS level

Test 6: Performance Benchmark
──────────────────────────────
Steps:
  1. Open browser dev tools (Network tab)
  2. Visit storefront
  3. Observe request timing for GET /rest/v1/products?...
  4. Measure response time

Expected:
  ✓ <500ms response time for typical storefront
  ✓ No 57014 timeouts
  ✓ Faster than before fix

Browser Console Checks:
─────────────────────
Should NOT see:
  ❌ "canceling statement due to statement timeout"
  ❌ Error code 57014
  ❌ "RLS violation" errors

Should see (in network tab):
  ✓ Products API returns 200 with data
  ✓ x-tenant-id header present in Request Headers

================================================================================
TROUBLESHOOTING
================================================================================

Issue: Still getting 57014 timeout after deploying SQL
─────────────────────────────────────────────────────

Causes:
  1. SQL didn't fully run - verify all policies dropped and new ones created
  2. Browser cache - old policy still cached
  3. Supabase instance not reloaded

Solutions:
  a) Re-run verification query to confirm final state
  b) Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
  c) Clear browser cache completely
  d) Wait 2 minutes for Supabase to propagate changes
  e) Try incognito/private window (no cache)

Issue: Products not showing after deployment
─────────────────────────────────────────────

Causes:
  1. x-tenant-id header not being set (frontend code didn't update)
  2. Tenant ID is null or wrong value
  3. RLS policy regex rejecting valid UUID

Solutions:
  a) Check browser Network tab - verify x-tenant-id header present
  b) Check header value is valid UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  c) Check useStorefrontData.ts uses tenantClient (verify changes applied)
  d) Check tenant resolution via useTenantFromDomain works (check console logs)

Issue: Getting 0 rows when should get products
───────────────────────────────────────────────

Cause:
  RLS policy is restricting too much

Debug:
  1. Verify header regex matches your UUID format
  2. Check if tenant_id column has correct UUIDs
  3. Verify is_online=true for some products
  4. Run: SELECT * FROM products WHERE tenant_id='your-tenant-id' AND is_online=true;

Issue: Staff product management not working
────────────────────────────────────────────

Cause:
  user_tenant_id() function failing or staff user not in profiles table

Debug:
  1. Verify user is in profiles table with correct tenant_id
  2. Check user_tenant_id() function exists and returns value
  3. Run: SELECT public.user_tenant_id(); (as authenticated user)

================================================================================
ROLLBACK PLAN (If Critical Issues)
================================================================================

If deployment causes critical issues:

1. IMMEDIATE (within minutes):
   - Revert frontend code push: git revert <commit_hash>
   - This keeps old supabase client which might have cached policies

2. RESTORE DATABASE (15-30 min):
   a) Supabase dashboard → Database → Backups
   b) Restore to point before fix_products_timeout.sql ran
   c) OR manually re-apply old policies from schema.sql

3. VERIFY:
   - Old policies should be back
   - May still have 57014 issue, but at least not broken

Note: The fix is non-destructive - we only DROP and CREATE policies.
      Data is untouched. Rollback is just re-creating old policies.

================================================================================
ROLLBACK FULL SQL (if needed)
================================================================================

If you need to manually restore old policies, run this in Supabase SQL Editor:

  BEGIN;
  
  -- Re-create permissive policies (not ideal but restores access)
  CREATE POLICY "Storefront users can view products" 
    ON public.products FOR SELECT TO authenticated, anon USING (true);
  
  CREATE POLICY "Tenant users can view their products"
    ON public.products FOR SELECT TO authenticated 
    USING (tenant_id IN (SELECT profiles.tenant_id FROM profiles 
                         WHERE profiles.id = auth.uid()));
  
  CREATE POLICY "tenant_select_products"
    ON public.products FOR SELECT USING (tenant_id = public.user_tenant_id());
  
  COMMIT;

This restores old behavior (with timeout issue) but ensures data accessibility.
After rolling back, you can diagnose and redeploy fixed version.

================================================================================
MONITORING (Post-Deployment)
================================================================================

Watch for these metrics over first 24 hours:

1. Error Rate:
   - Monitor: 57014 errors in Supabase logs
   - Target: 0 occurrences
   - Location: Supabase Dashboard → Logs

2. Response Time:
   - Monitor: Average GET /rest/v1/products time
   - Target: <500ms
   - Location: Browser DevTools or APM tool

3. User Reports:
   - Storefront browsing working
   - Checkout process completing
   - No product visibility issues

4. Cross-Tenant Isolation:
   - Products from different tenants are isolated
   - No accidental data leaks

================================================================================
SUCCESS CRITERIA
================================================================================

Deployment is successful when:

  ✓ All 5 RLS policies created in database
  ✓ Anonymous storefront browsing works
  ✓ Products load in <500ms (no 57014 timeouts)
  ✓ Correct tenant products shown (no cross-tenant leakage)
  ✓ Logged-in customers can browse
  ✓ Staff can manage products
  ✓ No error messages in browser console
  ✓ x-tenant-id header present in all requests

================================================================================
