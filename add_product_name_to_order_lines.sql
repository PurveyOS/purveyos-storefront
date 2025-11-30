-- Add missing columns to order_lines table
-- Run this in Supabase SQL Editor

-- Add product_name column (denormalized for historical accuracy)
ALTER TABLE order_lines 
ADD COLUMN IF NOT EXISTS product_name TEXT;

-- Add is_pre_order column if missing
ALTER TABLE order_lines 
ADD COLUMN IF NOT EXISTS is_pre_order BOOLEAN DEFAULT false;

-- Update existing records to populate product_name from products table
UPDATE order_lines ol
SET product_name = p.name
FROM products p
WHERE ol.product_id = p.id 
  AND ol.product_name IS NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_order_lines_product_name ON order_lines(product_name);

-- Add comments
COMMENT ON COLUMN order_lines.product_name IS 'Product name at time of order (denormalized for historical accuracy)';
COMMENT ON COLUMN order_lines.is_pre_order IS 'Whether this item is a pre-order';

-- Verify the columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'order_lines' 
  AND column_name IN ('product_name', 'is_pre_order')
ORDER BY column_name;
