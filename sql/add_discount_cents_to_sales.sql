-- Add discount_cents column to sales table
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS discount_cents INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN sales.discount_cents IS 'Discount amount in cents applied to this sale';
