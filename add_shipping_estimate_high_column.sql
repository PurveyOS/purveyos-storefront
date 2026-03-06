-- Add shipping_estimate_high_cents column to orders table
-- Stores the maximum shipping estimate shown to the customer at checkout.
-- The POS shipment planner uses this to cap the customer charge.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shipping_estimate_high_cents integer DEFAULT 0;

-- Backfill existing shipping orders: set high estimate to 115% of shipping_cents
-- (matches updated estimate-shipping Shippo buffer of 15%)
UPDATE orders
SET shipping_estimate_high_cents = GREATEST(
  shipping_cents,
  ROUND(shipping_cents * 1.15)
)
WHERE shipping_cents > 0
  AND (shipping_estimate_high_cents IS NULL OR shipping_estimate_high_cents = 0);
