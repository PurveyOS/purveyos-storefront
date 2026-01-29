-- ============================================================================
-- Migration: Create public Storage bucket with tenant-scoped RLS
-- ============================================================================
-- Bucket: product-images (public=true for direct URL access)
-- RLS: Only owner/admin/staff with matching tenant_id can upload/update/delete
-- Path enforcement: Objects must be stored under tenant_id/ prefix
-- Public read: Via bucket public=true (no SELECT policy needed)
-- ============================================================================

BEGIN;

-- Create bucket (public=true for direct URL access, no auth required for reads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true, -- Public bucket for direct URL access
  5242880, -- 5MB limit per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- RLS Policies: Tenant-scoped access for owner/admin/staff only
-- ============================================================================

-- Helper function to check if user has required role
CREATE OR REPLACE FUNCTION user_has_product_management_role()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'staff')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get user's tenant_id
CREATE OR REPLACE FUNCTION user_tenant_id_for_storage()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT tenant_id FROM public.profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: INSERT - Only owner/admin/staff can upload to their tenant folder
CREATE POLICY "Tenant owner/admin/staff can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND user_has_product_management_role()
  AND (storage.foldername(name))[1] = user_tenant_id_for_storage()::TEXT
);

-- Policy: UPDATE - Only owner/admin/staff can update their tenant's images
CREATE POLICY "Tenant owner/admin/staff can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND user_has_product_management_role()
  AND (storage.foldername(name))[1] = user_tenant_id_for_storage()::TEXT
);

-- Policy: DELETE - Only owner/admin/staff can delete their tenant's images
CREATE POLICY "Tenant owner/admin/staff can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND user_has_product_management_role()
  AND (storage.foldername(name))[1] = user_tenant_id_for_storage()::TEXT
);

-- Note: No SELECT policy needed - public bucket allows anonymous reads
-- Path structure enforced: {tenant_id}/{filename}.ext

COMMIT;
