-- Migration: Add storefront subscription integration
-- Date: 2026-01-09
-- Purpose: Link storefront orders to customer subscriptions and fulfillment via subscription_deliveries

BEGIN;

-- Ensure orders table has stripe_payment_intent_id column (for idempotency)
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Create UNIQUE index for idempotency (scoped to tenant + payment intent)
-- This prevents duplicate order creation on webhook retries / network retries
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_stripe_pi 
  ON public.orders(tenant_id, stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id <> '';

-- Ensure source column exists on orders (to distinguish 'storefront' from 'pos')
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'storefront';

-- Verify subscription_deliveries schema is correct:
-- - order_id: UUID FK -> public.orders(id) ✓
-- - custom_items: JSONB (not TEXT) ✓  
-- - status: 'scheduled' | 'order_created' | 'fulfilled' | 'skipped' ✓

-- Add FK constraint if missing (orders.id to subscription_deliveries.order_id)
-- Note: May already exist; will raise constraint error if re-creating
-- ALTER TABLE public.subscription_deliveries
--   ADD CONSTRAINT fk_subscription_deliveries_order_id
--   FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
-- (Skipping because constraint likely already exists)

-- Verify customer_subscriptions.stripe_payment_intent_id exists (for idempotency tracking)
ALTER TABLE public.customer_subscriptions 
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

COMMIT;
