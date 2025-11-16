-- Storefront Database Schema Requirements
-- Run this in Supabase SQL Editor to ensure all required tables and columns exist

-- First, let's check what tables actually exist
-- Run this query first to see your table names:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;

-- 1. Tenant table requirements (adjust table name based on your actual schema)
-- The storefront expects these columns in the Tenant table:
-- ✓ id (already exists)
-- ✓ slug (already exists) 
-- ✓ name (already exists)
-- ✓ storefront_enabled (you've already set this to true)
-- ? subscription_tier (may need to add)

-- Add subscription_tier column if it doesn't exist
ALTER TABLE "Tenant" 
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'basic';

-- Update Sweet P Pastures to have pro tier
UPDATE "Tenant" 
SET subscription_tier = 'pro_webhosting' 
WHERE slug = 'sweet-p-pastures';

-- 2. Product table requirements
-- The storefront expects these columns in the Product table:
-- ✓ tenant_id (should exist)
-- ✓ name (should exist)
-- ✓ is_online (critical - shows/hides products on storefront)
-- ? description, price_per, unit, category_id, image_url (may exist with different names)

-- Add is_online column if it doesn't exist
ALTER TABLE "Product" 
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;

-- Add other potential storefront columns if they don't exist
ALTER TABLE "Product" 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS price_per DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT 'lb',
ADD COLUMN IF NOT EXISTS category_id UUID,
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 3. Category table requirements
-- The storefront expects a Category table:
-- Create Category table if it doesn't exist
CREATE TABLE IF NOT EXISTS "Category" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Storefront Settings table
-- Create storefront_settings table for customization
CREATE TABLE IF NOT EXISTS storefront_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE UNIQUE,
    template_id VARCHAR(50) DEFAULT 'modern',
    primary_color VARCHAR(7) DEFAULT '#0f6fff',
    accent_color VARCHAR(7) DEFAULT '#ffcc00',
    logo_url TEXT,
    hero_image_url TEXT,
    hero_heading TEXT DEFAULT 'Farm Fresh Goodness',
    hero_subtitle TEXT DEFAULT 'From our pasture to your table.',
    farm_name TEXT,
    farm_description TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Orders table for checkout functionality
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
    customer_name VARCHAR(255) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(20),
    delivery_method VARCHAR(50) NOT NULL, -- 'pickup' or 'delivery'
    delivery_address TEXT,
    delivery_instructions TEXT,
    payment_method VARCHAR(50) NOT NULL, -- 'venmo', 'zelle', 'card'
    payment_details JSONB,
    subtotal DECIMAL(10,2) NOT NULL,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'completed', 'cancelled'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Order Lines table
CREATE TABLE IF NOT EXISTS order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES "Product"(id) ON DELETE RESTRICT,
    product_name VARCHAR(255) NOT NULL, -- Store name at time of order
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Add sample data for Sweet P Pastures if needed
-- Insert default storefront settings for Sweet P Pastures
INSERT INTO storefront_settings (tenant_id, farm_name, farm_description, contact_email, contact_phone)
SELECT 
    id as tenant_id,
    'Sweet P Pastures' as farm_name,
    'Premium quality meats from our family farm to your table.' as farm_description,
    'hello@sweetppastures.com' as contact_email,
    '(555) 123-4567' as contact_phone
FROM "Tenant" 
WHERE slug = 'sweet-p-pastures'
ON CONFLICT (tenant_id) DO NOTHING;

-- 8. Create some sample categories if none exist
INSERT INTO "Category" (tenant_id, name, description, sort_order)
SELECT 
    t.id as tenant_id,
    category_data.name,
    category_data.description,
    category_data.sort_order
FROM "Tenant" t
CROSS JOIN (
    VALUES 
    ('Beef', 'Premium grass-fed beef cuts', 1),
    ('Pork', 'Pasture-raised pork products', 2),
    ('Chicken', 'Free-range chicken products', 3)
) AS category_data(name, description, sort_order)
WHERE t.slug = 'sweet-p-pastures'
AND NOT EXISTS (
    SELECT 1 FROM "Category" c WHERE c.tenant_id = t.id
);

-- 9. Enable some existing products for online sales (if any exist)
-- You may need to manually set is_online = true for products you want to show
UPDATE "Product" 
SET is_online = true 
WHERE tenant_id = (SELECT id FROM "Tenant" WHERE slug = 'sweet-p-pastures')
AND is_online IS NOT FALSE; -- Only update if not explicitly set to false

-- 10. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_tenant_online ON "Product"(tenant_id, is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON order_lines(order_id);