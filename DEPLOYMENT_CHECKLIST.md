# 🚀 Deployment Checklist

## Pre-Deployment
- [ ] Backup database: `npx supabase db dump > backup_$(Get-Date -Format 'yyyyMMdd').sql`
- [ ] Verify Supabase Storage enabled (Dashboard → Storage)
- [ ] Get service role key (Project Settings → API)
- [ ] Create `scripts/.env` with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

## Phase 1: Deploy Migrations
```powershell
cd C:\dev\purveyos-storefront
npx supabase db push
```
- [ ] Migration deployed successfully
- [ ] Verify: `SELECT image_url FROM products LIMIT 1;` (should return null)
- [ ] Verify bucket: Check Supabase Dashboard → Storage → product-images exists

## Phase 2: Run Migration Script
```powershell
cd C:\dev\purveyos-storefront\scripts
npm install
npm run migrate:images
```
- [ ] All 17 products migrated successfully
- [ ] No errors in console
- [ ] Verify: `SELECT id, name, image_url FROM products WHERE image_url IS NOT NULL;`

## Phase 3: Deploy Edge Function
```powershell
cd C:\dev\purveyos-storefront
npx supabase functions deploy storefront-products
```
- [ ] Deployment successful
- [ ] Check logs: `npx supabase functions logs storefront-products`

## Phase 4: Deploy Storefront
```powershell
cd C:\dev\purveyos-storefront
npm run build
# Deploy to Cloudflare Pages (your usual method)
```
- [ ] Build successful
- [ ] Deployment successful
- [ ] Test storefront: Open https://{tenant}.yourdomain.com

## Phase 5: Deploy Admin Panel
```powershell
cd C:\dev\Huckster-UI
npm run build
# Deploy via your usual method
```
- [ ] Build successful
- [ ] Deployment successful

## Testing

### Storefront Performance
- [ ] Open Network tab in Chrome DevTools
- [ ] Load storefront page
- [ ] Verify: storefront-products response <500ms (was 3.6s)
- [ ] Verify: All 17 product images display correctly
- [ ] Verify: Images load in parallel
- [ ] Test: Reload page → images cached (instant)

### Admin Panel - New Product
- [ ] Log into admin panel
- [ ] Create new product
- [ ] Upload image
- [ ] Verify: Upload shows "Image uploaded successfully"
- [ ] Save product
- [ ] Check database: `SELECT image_url FROM products WHERE name = 'Your New Product';`
- [ ] Verify: image_url contains Storage URL

### Admin Panel - Edit Product
- [ ] Edit existing product
- [ ] Change image
- [ ] Save
- [ ] Verify: New image displays on storefront

### Console Checks
```sql
-- All products should have image_url now
SELECT 
  COUNT(*) as total_products,
  COUNT(image_url) as has_url,
  COUNT(image) as has_base64
FROM products;

-- Check Storage
SELECT name, metadata->>'size' as size_bytes
FROM storage.objects 
WHERE bucket_id = 'product-images'
LIMIT 10;
```

## Cleanup (After 24-48h)
- [ ] Verified no errors in production
- [ ] Verified performance improvement sustained
- [ ] All users report no issues
- [ ] Run: `npx supabase db query < scripts/cleanup_base64_images.sql`
- [ ] Verify: image column nulled for migrated products
- [ ] Check database size reduction

## Success Metrics
- [ ] Page load time: <1s (was 3.6s)
- [ ] Products query: <100ms (was 1.2s)
- [ ] Network payload: <100KB (was 4.3MB)
- [ ] Images cached by browser
- [ ] No broken images
- [ ] New products use Storage URLs

## Rollback (If Needed)
If issues occur, frontend already has fallback (`image_url || image`), so nothing breaks.

To completely revert:
```sql
BEGIN;
ALTER TABLE products DROP COLUMN IF EXISTS image_url;
DELETE FROM storage.buckets WHERE id = 'product-images';
COMMIT;
```

## Notes
- Base64 images preserved during migration (safe rollback)
- RLS policies restrict uploads to owner/admin/staff only
- Public bucket allows storefront to load images without auth
- Cleanup script can be run anytime after verification
