-- ============================================================================
-- Migration: Add image_url column for Storage migration
-- ============================================================================
-- Strategy: Non-destructive migration with fallback support
-- - Add image_url column (nullable)
-- - Migrate base64 -> Storage URLs
-- - Update apps to use image_url with fallback to image
-- - After verification: SET image = NULL (cleanup)
-- - Future: DROP image column entirely
-- ============================================================================

BEGIN;

-- Add new column for Storage URLs
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.products.image_url IS 
'Public URL from Supabase Storage (replaces base64 image column)';

-- Create index for image_url lookups (optional, for future optimization)
CREATE INDEX IF NOT EXISTS idx_products_image_url 
ON public.products(image_url) 
WHERE image_url IS NOT NULL;

COMMIT;
