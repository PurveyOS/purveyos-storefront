-- Add per-product label settings columns to products table
-- These control whether regulatory line and safe handling panel appear on labels

-- Add showRegulatoryLine column (defaults to true for existing products)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS show_regulatory_line BOOLEAN DEFAULT true;

-- Add showSafeHandling column (defaults to true for existing products)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS show_safe_handling BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN products.show_regulatory_line IS 'Whether to show regulatory line (PL 90-492) on this product''s labels';
COMMENT ON COLUMN products.show_safe_handling IS 'Whether to show safe handling panel on this product''s labels';

-- Verify the columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'products' 
  AND column_name IN ('show_regulatory_line', 'show_safe_handling')
ORDER BY column_name;
