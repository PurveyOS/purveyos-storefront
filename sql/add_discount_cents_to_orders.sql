-- Add discount_cents column to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS discount_cents INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN orders.discount_cents IS 'Discount amount in cents applied to this order';
