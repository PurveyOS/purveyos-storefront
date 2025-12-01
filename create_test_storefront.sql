-- Complete Test Account Setup with Mock Products and Images
-- This creates a full demo storefront with products, images, and test customer

-- 1. Create test tenant (using proper UUID)
INSERT INTO tenants (id, slug, name, subscription_tier, storefront_enabled, tax_rate, tax_included, charge_tax_on_online)
VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'testfarm',
  'Test Farm Store',
  'pro_webhosting',
  true,
  0.08,
  false,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  subscription_tier = EXCLUDED.subscription_tier,
  storefront_enabled = EXCLUDED.storefront_enabled;

-- 2. Create storefront settings with hero image
INSERT INTO storefront_settings (tenant_id, template_id, primary_color, accent_color, farm_name, hero_heading, hero_subtitle, hero_image_url, logo_url)
VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'modern',
  '#2d5016',
  '#8bc34a',
  'Test Farm Store',
  'Fresh from Our Farm',
  'Premium quality meats and produce delivered fresh to your door',
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=200&h=200&fit=crop'
)
ON CONFLICT (tenant_id) DO UPDATE SET
  template_id = EXCLUDED.template_id,
  hero_heading = EXCLUDED.hero_heading,
  hero_subtitle = EXCLUDED.hero_subtitle,
  hero_image_url = EXCLUDED.hero_image_url;

-- 3. Create mock products with Unsplash images
INSERT INTO products (id, name, unit, "pricePer", qty, image, category, online_description, is_online, allow_pre_order, tenant_id)
VALUES
  -- Beef Products
  ('test-ribeye', 'Ribeye Steak', 'lb', 28.99, 50, 'https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=300&fit=crop', 'beef', 'Premium grass-fed ribeye steak with exceptional marbling', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-ground-beef', 'Ground Beef', 'lb', 8.99, 100, 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=400&h=300&fit=crop', 'beef', 'Lean grass-fed ground beef, perfect for burgers', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-ny-strip', 'NY Strip Steak', 'lb', 26.99, 40, 'https://images.unsplash.com/photo-1588347818463-d34a1c0de0a6?w=400&h=300&fit=crop', 'beef', 'Tender NY strip steak with perfect flavor', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  
  -- Pork Products
  ('test-pork-chops', 'Bone-In Pork Chops', 'lb', 12.99, 60, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop', 'pork', 'Thick-cut bone-in pork chops from pasture-raised pigs', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-bacon', 'Thick-Cut Bacon', 'lb', 15.99, 80, 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=400&h=300&fit=crop', 'pork', 'Artisan thick-cut bacon with no preservatives', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-sausage', 'Breakfast Sausage', 'lb', 9.99, 70, 'https://images.unsplash.com/photo-1624198103148-02ed8d309be8?w=400&h=300&fit=crop', 'pork', 'Farm-fresh breakfast sausage links', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  
  -- Chicken Products
  ('test-whole-chicken', 'Whole Chicken', 'lb', 6.99, 90, 'https://images.unsplash.com/photo-1543842533-20ae35aa19e5?w=400&h=300&fit=crop', 'chicken', 'Fresh whole chicken from free-range hens', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-chicken-breast', 'Chicken Breast', 'lb', 11.99, 75, 'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400&h=300&fit=crop', 'chicken', 'Boneless skinless chicken breast', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-chicken-thighs', 'Chicken Thighs', 'lb', 8.99, 65, 'https://images.unsplash.com/photo-1580371891797-0a32e7fd0be1?w=400&h=300&fit=crop', 'chicken', 'Juicy bone-in chicken thighs', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  
  -- Eggs & Dairy
  ('test-eggs', 'Farm Fresh Eggs', 'ea', 6.99, 120, 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&h=300&fit=crop', 'eggs', 'One dozen farm-fresh free-range eggs', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-milk', 'Raw Milk', 'ea', 12.99, 50, 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&h=300&fit=crop', 'dairy', 'Fresh raw milk from grass-fed cows (1 gallon)', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
ON CONFLICT (id) DO UPDATE SET
  image = EXCLUDED.image,
  online_description = EXCLUDED.online_description,
  is_online = EXCLUDED.is_online;

-- 4. Create package_bins for inventory (weight-based products)
INSERT INTO package_bins (package_key, product_id, weight_btn, unit_price_cents, qty, tenant_id)
VALUES
  -- Ribeye at different weights
  ('test-ribeye|1', 'test-ribeye', 1.0, 2899, 20, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-ribeye|1.5', 'test-ribeye', 1.5, 2899, 15, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-ribeye|2', 'test-ribeye', 2.0, 2899, 15, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  
  -- Ground beef packages
  ('test-ground-beef|1', 'test-ground-beef', 1.0, 899, 50, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-ground-beef|2', 'test-ground-beef', 2.0, 899, 30, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-ground-beef|5', 'test-ground-beef', 5.0, 899, 20, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  
  -- Pork chops
  ('test-pork-chops|1.5', 'test-pork-chops', 1.5, 1299, 30, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-pork-chops|2', 'test-pork-chops', 2.0, 1299, 30, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  
  -- Bacon
  ('test-bacon|1', 'test-bacon', 1.0, 1599, 40, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-bacon|2', 'test-bacon', 2.0, 1599, 40, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  
  -- Whole chicken
  ('test-whole-chicken|4', 'test-whole-chicken', 4.0, 699, 45, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-whole-chicken|5', 'test-whole-chicken', 5.0, 699, 45, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  
  -- Each-based products (weight_btn = 0)
  ('test-eggs|0', 'test-eggs', 0, 699, 60, 'f47ac10b-58cc-4372-a567-0e02b2c3d479'),
  ('test-milk|0', 'test-milk', 0, 1299, 25, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
ON CONFLICT (package_key) DO UPDATE SET qty = EXCLUDED.qty;

-- 5. Create subscription box product
INSERT INTO products (id, name, unit, "pricePer", qty, image, category, online_description, is_online, allow_pre_order, tenant_id)
VALUES
  ('test-meat-box', 'Monthly Meat Box', 'ea', 99.99, 999, 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=400&h=300&fit=crop', 'subscription boxes', 'Monthly curated selection of our best meats', true, false, 'f47ac10b-58cc-4372-a567-0e02b2c3d479')
ON CONFLICT (id) DO UPDATE SET
  image = EXCLUDED.image,
  online_description = EXCLUDED.online_description;

-- 6. Create subscription_product for the meat box
INSERT INTO subscription_products (id, tenant_id, product_id, name, description, price_per_interval, interval_type, interval_count, duration_type, is_active, allows_pickup_selection)
VALUES
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'test-meat-box', 'Monthly Meat Box', 'Get a curated selection of premium meats delivered monthly', 99.99, 'monthly', 1, 'ongoing', true, true)
ON CONFLICT (id) DO UPDATE SET is_active = EXCLUDED.is_active;

-- 7. Create test customer account (email: test@testfarm.com, password: TestFarm123!)
-- Note: You'll need to sign up through the storefront with this email first, then run this to complete the profile

-- Check if test user exists
DO $$
DECLARE
  test_user_id UUID;
BEGIN
  -- Try to find existing test user
  SELECT id INTO test_user_id FROM auth.users WHERE email = 'test@testfarm.com';
  
  IF test_user_id IS NOT NULL THEN
    -- Update customer_profiles for test user
    INSERT INTO customer_profiles (id, tenant_id, phone)
    VALUES (test_user_id, 'f47ac10b-58cc-4372-a567-0e02b2c3d479', '555-123-4567')
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      phone = EXCLUDED.phone;
      
    RAISE NOTICE 'Updated profile for existing test user: %', test_user_id;
  ELSE
    RAISE NOTICE 'Test user does not exist yet. Sign up at https://testfarm.purveyos.store with email: test@testfarm.com';
  END IF;
END $$;

-- 8. Verification queries
SELECT 'Tenant Created' as status, slug, name FROM tenants WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
SELECT 'Products Created' as status, COUNT(*) as count FROM products WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' AND is_online = true;
SELECT 'Package Bins Created' as status, COUNT(*) as count FROM package_bins WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
SELECT 'Subscription Product' as status, name, is_active FROM subscription_products WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- Access your test storefront at: https://testfarm.purveyos.store
-- Login with: test@testfarm.com / TestFarm123! (after signing up)
