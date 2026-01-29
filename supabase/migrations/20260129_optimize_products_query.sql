-- ============================================================================
-- Migration: Optimize products query performance
-- ============================================================================
-- Problem: Products fetch taking 1200ms for 17 products
-- Solution: Add composite index on (tenant_id, is_online) to bypass full table scan
-- ============================================================================

BEGIN;

-- Create optimized composite index for the most common query pattern
-- This replaces the need for multiple separate indexes
CREATE INDEX IF NOT EXISTS idx_products_tenant_is_online_optimized
ON public.products (tenant_id, is_online)
WHERE is_online = true;

COMMIT;
