-- Add description column to products table for plain text product descriptions
-- This allows tenants to optionally add descriptions that will display on their storefront

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL;

-- Description is optional (nullable)
-- No character limit at DB level (can add in UI validation)
-- Plain text only (no HTML/markdown parsing)

COMMENT ON COLUMN products.description IS 'Optional plain text description displayed on storefront';
