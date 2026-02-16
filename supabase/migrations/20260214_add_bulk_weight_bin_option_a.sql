-- Migration: Add Bulk Weight Bin Support - Storefront (Option A)
-- Date: 2026-02-14
-- Author: PurveyOS
-- Purpose: Add bulk weight bin schema to storefront database
-- 
-- NOTE: This migration mirrors Huckster-UI's Option A schema.
-- Both Huckster-UI and purveyos-storefront share the same Supabase database,
-- so this file provides schema documentation + future-proofing if they diverge.

BEGIN;

-- ============================================================================
-- 1. Add bin_kind column (NULL = legacy package_group, no backfill)
-- ============================================================================
ALTER TABLE public.package_bins 
ADD COLUMN IF NOT EXISTS bin_kind TEXT NULL
CHECK (bin_kind IS NULL OR bin_kind IN ('bulk_weight'));

COMMENT ON COLUMN public.package_bins.bin_kind IS 
'Type of bin: NULL = legacy package_group (discrete pre-packaged items), bulk_weight = variable-weight items from single bulk bin.';

-- ============================================================================
-- 2. Add qty_lbs column (numeric weight, NULL for legacy package bins)
-- ============================================================================
ALTER TABLE public.package_bins 
ADD COLUMN IF NOT EXISTS qty_lbs NUMERIC NULL;

COMMENT ON COLUMN public.package_bins.qty_lbs IS 
'For bulk_weight bins only: weight on hand in pounds (lbs). NULL for legacy package_group bins.';

-- ============================================================================
-- 3. Add reserved_lbs column (numeric weight reserved, default 0)
-- ============================================================================
ALTER TABLE public.package_bins 
ADD COLUMN IF NOT EXISTS reserved_lbs NUMERIC NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.package_bins.reserved_lbs IS 
'For bulk_weight bins only: weight reserved by pending orders (lbs). 0 for legacy package_group bins. Must be <= qty_lbs.';

-- ============================================================================
-- 4. Create unique index: one bulk bin per product per tenant
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_bulk_bin_per_product 
  ON public.package_bins(tenant_id, product_id) 
  WHERE bin_kind = 'bulk_weight';

-- ============================================================================
-- 5. Create lookup index for faster bulk bin queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_package_bins_bin_kind_lookup 
  ON public.package_bins(tenant_id, product_id, bin_kind);

-- ============================================================================
-- 6. Data integrity check
-- ============================================================================
DO $$
DECLARE
  v_null_bin_kind INT;
  v_bulk_bins INT;
BEGIN
  SELECT COUNT(*) INTO v_null_bin_kind 
  FROM public.package_bins 
  WHERE bin_kind IS NULL;
  
  SELECT COUNT(*) INTO v_bulk_bins 
  FROM public.package_bins 
  WHERE bin_kind = 'bulk_weight';
  
  RAISE NOTICE 'Storefront migration 20260214_add_bulk_weight_bin_option_a:
    - Existing legacy bins (bin_kind=NULL): %
    - Existing bulk bins (bin_kind=bulk_weight): %',
    v_null_bin_kind, v_bulk_bins;
END;
$$;

COMMIT;

