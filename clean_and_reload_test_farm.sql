-- Delete all test farm products and reload them with proper tenant isolation

-- 1. Delete all test products (products with 'test-' prefix)
DELETE FROM order_lines WHERE product_id LIKE 'test-%';
DELETE FROM sale_lines WHERE product_id LIKE 'test-%';
DELETE FROM package_bins WHERE product_id LIKE 'test-%';
DELETE FROM inventory_txns WHERE product_id LIKE 'test-%';
DELETE FROM labels WHERE "productId" LIKE 'test-%';
DELETE FROM subscription_box_items WHERE product_id LIKE 'test-%';
DELETE FROM products WHERE id LIKE 'test-%';

-- 2. Recreate test products with proper tenant_id
INSERT INTO products (id, tenant_id, name, unit, "pricePer", qty, image, category, is_online, "updatedAt")
VALUES
  -- Beef Products
  ('test-ribeye', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Ribeye Steak', 'lb', 28.99, 0,
   'https://images.unsplash.com/photo-1588168333986-5078d3ae3976?w=800&h=600&fit=crop', 'beef', true, NOW()),
  
  ('test-ground-beef', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Ground Beef', 'lb', 8.99, 0,
   'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=800&h=600&fit=crop', 'beef', true, NOW()),
  
  ('test-ny-strip', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'NY Strip Steak', 'lb', 26.99, 0,
   'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&h=600&fit=crop', 'beef', true, NOW()),
  
  -- Pork Products
  ('test-pork-chops', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Bone-In Pork Chops', 'lb', 12.99, 0,
   'https://images.unsplash.com/photo-1602470520998-f4a52199a3d6?w=800&h=600&fit=crop', 'pork', true, NOW()),
  
  ('test-bacon', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Thick-Cut Bacon', 'lb', 15.99, 0,
   'https://images.unsplash.com/photo-1528607929212-2636ec44253e?w=800&h=600&fit=crop', 'pork', true, NOW()),
  
  ('test-sausage', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Breakfast Sausage', 'lb', 9.99, 0,
   'https://images.unsplash.com/photo-1624191249446-2871f1c6ac99?w=800&h=600&fit=crop', 'pork', true, NOW()),
  
  -- Chicken Products
  ('test-whole-chicken', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Whole Chicken', 'lb', 6.99, 0,
   'https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=800&h=600&fit=crop', 'chicken', true, NOW()),
  
  ('test-chicken-breast', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Chicken Breast', 'lb', 11.99, 0,
   'https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=800&h=600&fit=crop', 'chicken', true, NOW()),
  
  ('test-chicken-thighs', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Chicken Thighs', 'lb', 8.99, 0,
   'https://images.unsplash.com/photo-1631711199738-c4f9e0c1f0ff?w=800&h=600&fit=crop', 'chicken', true, NOW()),
  
  -- Dairy/Other
  ('test-eggs', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Farm Fresh Eggs', 'ea', 6.99, 0,
   'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=800&h=600&fit=crop', 'dairy', true, NOW()),
  
  ('test-milk', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Raw Milk', 'ea', 12.99, 0,
   'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=800&h=600&fit=crop', 'dairy', true, NOW());

-- 3. Create package bins for test products (sample inventory at various weights)
INSERT INTO package_bins (package_key, product_id, tenant_id, weight_btn, unit_price_cents, qty, created_at, updated_at)
VALUES
  -- Ribeye packages
  ('test-ribeye|1.00', 'test-ribeye', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 1.0, 2899, 5, NOW(), NOW()),
  ('test-ribeye|1.50', 'test-ribeye', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 1.5, 2899, 3, NOW(), NOW()),
  ('test-ribeye|2.00', 'test-ribeye', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 2.0, 2899, 2, NOW(), NOW()),
  
  -- Ground Beef packages
  ('test-ground-beef|1.00', 'test-ground-beef', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 1.0, 899, 10, NOW(), NOW()),
  ('test-ground-beef|2.00', 'test-ground-beef', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 2.0, 899, 8, NOW(), NOW()),
  
  -- Chicken Breast packages
  ('test-chicken-breast|1.00', 'test-chicken-breast', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 1.0, 1199, 6, NOW(), NOW()),
  ('test-chicken-breast|1.50', 'test-chicken-breast', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 1.5, 1199, 4, NOW(), NOW()),
  
  -- Whole Chicken packages
  ('test-whole-chicken|4.00', 'test-whole-chicken', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 4.0, 699, 5, NOW(), NOW()),
  ('test-whole-chicken|5.00', 'test-whole-chicken', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 5.0, 699, 3, NOW(), NOW());

-- 4. Verification - Show test farm products
SELECT 'Test Farm Products' as section,
       id,
       name,
       tenant_id,
       unit,
       "pricePer",
       is_online
FROM products
WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
ORDER BY category, name;

-- 5. Verify package_bins
SELECT 'Test Farm Package Bins' as section,
       package_key,
       product_id,
       tenant_id,
       weight_btn,
       qty
FROM package_bins
WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
ORDER BY product_id, weight_btn;

-- 6. Verify tenant counts
SELECT 'Product Count by Tenant' as section,
       t.slug as tenant_slug,
       t.name as tenant_name,
       COUNT(p.id) as product_count
FROM tenants t
LEFT JOIN products p ON p.tenant_id = t.id
GROUP BY t.id, t.slug, t.name
ORDER BY t.slug;
