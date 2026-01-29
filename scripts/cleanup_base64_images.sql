-- ============================================================================
-- Cleanup: Null out base64 image column after migration verification
-- ============================================================================
-- Run AFTER verifying image_url migration successful (24-48 hours)
-- This frees up database storage and reduces query payload
-- ============================================================================

BEGIN;

-- Safety check: Only null out if image_url exists
UPDATE public.products
SET image = NULL
WHERE image_url IS NOT NULL
  AND image IS NOT NULL
  AND image LIKE 'data:image/%';

-- Verify results
SELECT 
  COUNT(*) FILTER (WHERE image IS NULL AND image_url IS NOT NULL) as cleaned_count,
  COUNT(*) FILTER (WHERE image IS NOT NULL AND image LIKE 'data:image/%') as still_has_base64,
  COUNT(*) FILTER (WHERE image_url IS NOT NULL) as has_url,
  pg_size_pretty(
    pg_total_relation_size('products')
  ) as table_size
FROM public.products;

COMMIT;

-- After running this and verifying, you can eventually drop the image column:
-- ALTER TABLE public.products DROP COLUMN IF EXISTS image;
