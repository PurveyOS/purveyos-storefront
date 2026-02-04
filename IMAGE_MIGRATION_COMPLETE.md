# Image Migration Complete ✅

## Files Created

### SQL Migrations
1. **[20260129_add_image_url_column.sql](c:\dev\purveyos-storefront\supabase\migrations\20260129_add_image_url_column.sql)**
   - Adds `image_url` column to products table
   - Non-destructive (preserves existing `image` column)
   - Creates index for performance

2. **[20260129_create_product_images_bucket.sql](c:\dev\purveyos-storefront\supabase\migrations\20260129_create_product_images_bucket.sql)**
   - Creates `product-images` Storage bucket (public=true)
   - **Tight RLS policies**: Only owner/admin/staff with matching tenant_id
   - Path enforcement: Must upload to `{tenant_id}/` folder
   - No SELECT policy (public bucket handles reads)

### Migration Scripts
3. **[migrate_images_to_storage.ts](c:\dev\purveyos-storefront\scripts\migrate_images_to_storage.ts)**
   - TypeScript migration script with error handling
   - Uploads base64 → Storage
   - Updates `image_url` column (preserves `image` for rollback)
   - Detailed logging and progress tracking

4. **[cleanup_base64_images.sql](c:\dev\purveyos-storefront\scripts\cleanup_base64_images.sql)**
   - Run AFTER 24-48h verification
   - Nulls out `image` column to free database space
   - Verification query included

5. **[scripts/package.json](c:\dev\purveyos-storefront\scripts\package.json)**
   - Dependencies: @supabase/supabase-js, tsx
   - Script: `npm run migrate:images`

6. **[scripts/.env.example](c:\dev\purveyos-storefront\scripts\.env.example)**
   - Template for environment variables
   - Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

### Code Updates

#### Storefront (purveyos-storefront)
7. **[supabase/functions/storefront-products/index.ts](c:\dev\purveyos-storefront\supabase\functions\storefront-products\index.ts)**
   - ✅ Changed: `image` → `image_url` in SELECT
   - Excludes base64 data from query

8. **[src/hooks/useStorefrontData.ts](c:\dev\purveyos-storefront\src\hooks\useStorefrontData.ts)**
   - ✅ Updated: `imageUrl: p.image_url || p.image || '/demo-product.svg'`
   - Fallback pattern for backward compatibility

#### Admin Panel (Huckster-UI)
9. **[src/utils/storage.ts](c:\dev\Huckster-UI\src\utils\storage.ts)** ⭐ NEW
   - `uploadProductImage(file)` - Uploads to Storage
   - `deleteProductImage(url)` - Cleanup helper
   - `isStorageUrl()` / `isBase64Image()` - Type checking
   - 5MB size limit, type validation, error handling

10. **[src/screens/NewProductScreen.tsx](c:\dev\Huckster-UI\src\screens\NewProductScreen.tsx)**
    - ✅ Import: `uploadProductImage` (replaces `fileToDataURL`)
    - ✅ State: `imageUrl` (replaces `imageDataUrl` + `imageUrlFallback`)
    - ✅ Handler: Uploads to Storage instead of base64 encoding
    - Loading state during upload

11. **[src/screens/EditProductScreen.tsx](c:\dev\Huckster-UI\src\screens\EditProductScreen.tsx)**
    - ✅ Import: `uploadProductImage`, `isStorageUrl`
    - ✅ Handler: Uploads to Storage on image change
    - Existing products keep base64 until edited

---

## Deployment Steps

### 1️⃣ Deploy SQL Migrations (5 min)
```powershell
cd C:\dev\purveyos-storefront

# Deploy migrations
npx supabase db push

# Or individually:
npx supabase migration up --file supabase/migrations/20260129_add_image_url_column.sql
npx supabase migration up --file supabase/migrations/20260129_create_product_images_bucket.sql
```

**Verify:**
```sql
-- Check column exists
SELECT image_url FROM products LIMIT 1;

-- Check bucket exists
SELECT * FROM storage.buckets WHERE id = 'product-images';
```

### 2️⃣ Run Migration Script (10 min)
```powershell
cd C:\dev\purveyos-storefront\scripts

# Create .env file
Copy-Item .env.example .env
# Edit .env and add your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

# Install dependencies
npm install

# Run migration
npm run migrate:images
```

**Expected output:**
```
🚀 Starting base64 → Storage migration...
📦 Found 17 products needing migration

[1/17] ✅ Farm Fresh Eggs (26KB)
         → https://xxx.supabase.co/storage/v1/object/public/product-images/{tenant_id}/{id}.jpg
...
📊 Migration Summary:
   ✅ Success: 17
   ⏭️  Skipped: 0
   ❌ Failed: 0
🎉 Migration completed successfully!
```

### 3️⃣ Deploy Edge Function (2 min)
```powershell
cd C:\dev\purveyos-storefront
npx supabase functions deploy storefront-products
```

### 4️⃣ Deploy Frontend (5 min)
```powershell
cd C:\dev\purveyos-storefront
npm run build
npm run deploy  # Or your Cloudflare deployment command
```

### 5️⃣ Deploy Admin Panel (5 min)
```powershell
cd C:\dev\Huckster-UI
npm run build
# Deploy via your usual method
```

### 6️⃣ Test (10 min)
- [ ] **Storefront**: Open https://{tenant}.yourdomain.com
  - All 17 products show images
  - Network tab: storefront-products <500ms (was 3.6s)
  - Images load in parallel
  - Browser caching works (reload is instant)

- [ ] **Admin Panel**: Create new product with image
  - Upload completes successfully
  - Image displays in product list
  - Check database: `image_url` has Storage URL

- [ ] **Performance**: Check Edge Function logs
  - Products fetch: <100ms (was 1200ms)
  - No base64 data in response payload

### 7️⃣ Cleanup (After 24-48h verification)
```powershell
cd C:\dev\purveyos-storefront
npx supabase db query < scripts/cleanup_base64_images.sql
```

**Result:**
- `image` column nulled out
- Database storage freed (~450KB per tenant)
- Only `image_url` remains

---

## Rollback Plan

If issues occur:

### Quick Rollback (Frontend only)
No action needed - frontend already has `image_url || image` fallback

### Full Rollback (Remove Migration)
```sql
-- Revert to base64 only
BEGIN;

-- Drop new column
ALTER TABLE products DROP COLUMN IF EXISTS image_url;

-- Drop bucket (optional - keeps uploaded files)
DELETE FROM storage.buckets WHERE id = 'product-images';

COMMIT;
```

---

## Performance Expectations

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Edge Function | 3.61s | <500ms | **7x faster** |
| Products query | 1.2s | <100ms | **12x faster** |
| Network payload | 4.3MB | <100KB | **40x smaller** |
| Image loading | Blocking | Parallel | **Non-blocking** |
| Browser cache | None | 1 year | **Instant reloads** |

---

## Storage RLS Security

✅ **Implemented (Tight Security):**
- Only authenticated users with `role IN ('owner','admin','staff')`
- Path enforcement: `{tenant_id}/` prefix required
- Automatic tenant_id validation via `user_tenant_id_for_storage()` function
- Public bucket for reads (no auth required for storefront)

❌ **NOT Implemented (Avoided):**
- Overly-broad `TO authenticated` policies
- Public INSERT/UPDATE/DELETE
- Cross-tenant access

---

## Next Actions

**Now:**
1. Deploy migrations ⬆️
2. Run migration script
3. Deploy Edge Function
4. Deploy frontend
5. Test storefront performance

**After 24-48h:**
1. Verify no errors in production
2. Run cleanup script
3. Monitor database size reduction

**Future (Optional):**
```sql
-- Eventually drop image column entirely
ALTER TABLE products DROP COLUMN IF EXISTS image;
```

---

## Support Files

All files created and ready to deploy:
- ✅ SQL migrations (2 files)
- ✅ TypeScript migration script
- ✅ Cleanup SQL script
- ✅ Storage helper utility
- ✅ Admin screen updates
- ✅ Frontend updates
- ✅ Environment template

**Total setup time:** ~30 minutes
**Expected performance gain:** 10x faster page loads
