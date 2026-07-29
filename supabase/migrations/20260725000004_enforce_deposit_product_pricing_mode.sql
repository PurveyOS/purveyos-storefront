-- Prevent invalid deposit pricing configuration.
-- For deposit products, exactly one final pricing field must be configured:
--   1) deposit_prod_price_per_lb > 0 (weight mode), OR
--   2) deposit_fixed_total > 0 (fixed mode)
-- This is added as NOT VALID so existing legacy rows do not block deploy.
-- New and updated rows are still enforced immediately.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_deposit_pricing_mode_chk'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT products_deposit_pricing_mode_chk
    CHECK (
      COALESCE(is_deposit_product, false) = false
      OR (
        (
          CASE WHEN COALESCE(deposit_prod_price_per_lb, 0) > 0 THEN 1 ELSE 0 END
          + CASE WHEN COALESCE(deposit_fixed_total, 0) > 0 THEN 1 ELSE 0 END
        ) = 1
      )
    ) NOT VALID;

    COMMENT ON CONSTRAINT products_deposit_pricing_mode_chk ON public.products IS
      'Deposit products must use exactly one pricing mode: weight (deposit_prod_price_per_lb) or fixed (deposit_fixed_total).';
  END IF;
END $$;
