-- ============================================================================
-- Migration: Add tenant slug index for faster lookups
-- ============================================================================
-- Problem: Tenant lookups by slug in useTenantFromDomain may be doing full table scans
-- Solution: Add index on tenants.slug for fast slug-based lookups
-- ============================================================================

BEGIN;

-- Add index on slug for fast tenant lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug 
ON public.tenants (slug);

COMMIT;
