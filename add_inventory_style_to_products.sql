-- Add inventory_style column to products table
-- Tracks whether product uses discrete package bins or bulk weight ordering
-- 'package' = discrete bins (default, existing behavior)
-- 'bulk' = single bulk weight bin

ALTER TABLE products
ADD COLUMN inventory_style VARCHAR(20) DEFAULT 'package';

-- Add check constraint to ensure valid values
ALTER TABLE products
ADD CONSTRAINT check_inventory_style CHECK (inventory_style IN ('package', 'bulk'));

-- Create index for filtering by inventory style (optional but useful)
CREATE INDEX idx_products_inventory_style ON products(inventory_style);
