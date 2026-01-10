-- Migration: Complete storefront subscription integration schema
-- Date: 2026-01-09
-- Purpose: Add missing columns and tables for subscription fulfillment

BEGIN;

-- ============================================
-- 1. ADD MISSING COLUMNS TO subscription_box_items
-- ============================================

ALTER TABLE public.subscription_box_items 
  ADD COLUMN IF NOT EXISTS substitution_group TEXT,
  ADD COLUMN IF NOT EXISTS is_substitution_option BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS substitution_group_units_allowed INTEGER;

COMMENT ON COLUMN public.subscription_box_items.substitution_group IS 'Group name for interchangeable products (e.g., "Protein", "Greens")';
COMMENT ON COLUMN public.subscription_box_items.is_substitution_option IS 'TRUE if this row is an alternative option (not the base group item)';
COMMENT ON COLUMN public.subscription_box_items.substitution_group_units_allowed IS 'Total units customer must select from this group';

-- Index for efficient group lookups
CREATE INDEX IF NOT EXISTS idx_subscription_box_items_substitution_group 
  ON public.subscription_box_items(subscription_product_id, substitution_group)
  WHERE substitution_group IS NOT NULL;

-- ============================================
-- 2. CREATE customer_substitution_preferences TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.customer_substitution_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_subscription_id UUID NOT NULL 
    REFERENCES public.customer_subscriptions(id) ON DELETE CASCADE,
  subscription_box_item_id UUID NOT NULL 
    REFERENCES public.subscription_box_items(id) ON DELETE CASCADE,
  chosen_product_id TEXT NOT NULL 
    REFERENCES public.products(id) ON DELETE RESTRICT,
  chosen_quantity NUMERIC(10,2) NOT NULL CHECK (chosen_quantity > 0),
  delivery_number INTEGER NOT NULL CHECK (delivery_number > 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  -- Prevent duplicate preferences for same delivery per chosen product
  CONSTRAINT unique_preference UNIQUE (customer_subscription_id, subscription_box_item_id, chosen_product_id, delivery_number)
);

COMMENT ON TABLE public.customer_substitution_preferences IS 'Customer product choices for subscription boxes (normalized storage)';
COMMENT ON COLUMN public.customer_substitution_preferences.subscription_box_item_id IS 'Base group item (not option row)';
COMMENT ON COLUMN public.customer_substitution_preferences.chosen_product_id IS 'Actual product customer selected from group';
COMMENT ON COLUMN public.customer_substitution_preferences.delivery_number IS 'Which delivery this preference applies to';

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_customer_substitution_preferences_subscription 
  ON public.customer_substitution_preferences(customer_subscription_id, delivery_number);

CREATE INDEX IF NOT EXISTS idx_customer_substitution_preferences_product 
  ON public.customer_substitution_preferences(chosen_product_id);

-- Additional index to speed group fulfillment lookup
CREATE INDEX IF NOT EXISTS idx_customer_substitution_preferences_group_lookup
  ON public.customer_substitution_preferences(customer_subscription_id, subscription_box_item_id, delivery_number);

-- ============================================
-- 3. ADD IDEMPOTENCY COLUMNS (if not exist)
-- ============================================

-- Ensure orders has stripe_payment_intent_id
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Create UNIQUE index for idempotency (scoped to tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_stripe_pi 
  ON public.orders(tenant_id, stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id <> '';

-- Ensure source column exists
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pos';

COMMENT ON COLUMN public.orders.stripe_payment_intent_id IS 'Stripe payment intent ID for idempotency (prevents duplicate orders on retries)';
COMMENT ON COLUMN public.orders.source IS 'Order source: "pos" (point-of-sale) or "storefront" (online)';

-- Ensure customer_subscriptions has stripe_payment_intent_id
ALTER TABLE public.customer_subscriptions 
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

COMMENT ON COLUMN public.customer_subscriptions.stripe_payment_intent_id IS 'Links subscription to original payment for audit trail';

-- ============================================
-- 4. VERIFY subscription_deliveries SCHEMA
-- ============================================

-- Verify order_id is UUID (should already be correct)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' 
      AND table_name='subscription_deliveries' 
      AND column_name='order_id' 
      AND udt_name='uuid'
  ) THEN
    RAISE EXCEPTION 'subscription_deliveries.order_id must be UUID type';
  END IF;
END
$$;

-- Verify custom_items is JSONB (should already be correct)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' 
      AND table_name='subscription_deliveries' 
      AND column_name='custom_items' 
      AND udt_name='jsonb'
  ) THEN
    RAISE EXCEPTION 'subscription_deliveries.custom_items must be JSONB type';
  END IF;
END
$$;

-- ============================================
-- 5. ENABLE ROW LEVEL SECURITY (if needed)
-- ============================================

-- Enable RLS on new table
ALTER TABLE public.customer_substitution_preferences ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view preferences for their tenant's subscriptions
CREATE POLICY customer_substitution_preferences_select_policy
  ON public.customer_substitution_preferences
  FOR SELECT
  USING (
    customer_subscription_id IN (
      SELECT id FROM public.customer_subscriptions 
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Policy: Users can insert preferences for their tenant's subscriptions
CREATE POLICY customer_substitution_preferences_insert_policy
  ON public.customer_substitution_preferences
  FOR INSERT
  WITH CHECK (
    customer_subscription_id IN (
      SELECT id FROM public.customer_subscriptions 
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- Policy: Users can update preferences for their tenant's subscriptions
CREATE POLICY customer_substitution_preferences_update_policy
  ON public.customer_substitution_preferences
  FOR UPDATE
  USING (
    customer_subscription_id IN (
      SELECT id FROM public.customer_subscriptions 
      WHERE tenant_id IN (
        SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================

-- Check subscription_box_items has new columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema='public' 
  AND table_name='subscription_box_items'
  AND column_name IN ('substitution_group', 'is_substitution_option', 'substitution_group_units_allowed')
ORDER BY ordinal_position;

-- Check customer_substitution_preferences exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' 
  AND table_name='customer_substitution_preferences'
ORDER BY ordinal_position;

-- Check orders idempotency index
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' 
  AND tablename='orders'
  AND indexname='idx_orders_tenant_stripe_pi';

-- ============================================
-- PATCH FOR EXISTING ENVIRONMENTS (idempotent safety)
-- If the table existed with the old unique constraint or FK action, fix them.
-- ============================================

-- 1) Fix unique constraint to allow multiple products per group (combos)
ALTER TABLE public.customer_substitution_preferences
  DROP CONSTRAINT IF EXISTS unique_preference;

ALTER TABLE public.customer_substitution_preferences
  ADD CONSTRAINT unique_preference
    UNIQUE (customer_subscription_id, subscription_box_item_id, chosen_product_id, delivery_number);

-- 2) Ensure chosen_product_id FK does NOT cascade deletes (preserve history)
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'customer_substitution_preferences'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'chosen_product_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.customer_substitution_preferences DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE public.customer_substitution_preferences
    ADD CONSTRAINT customer_substitution_preferences_chosen_product_id_fkey
      FOREIGN KEY (chosen_product_id)
      REFERENCES public.products(id)
      ON DELETE RESTRICT;
END $$;

-- 3) Add group lookup index (helps POS fulfill queries)
CREATE INDEX IF NOT EXISTS idx_csp_group_lookup
  ON public.customer_substitution_preferences(customer_subscription_id, subscription_box_item_id, delivery_number);
