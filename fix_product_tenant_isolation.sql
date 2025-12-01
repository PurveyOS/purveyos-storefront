-- Verify and fix product tenant assignments
-- Ensure test products ONLY show in Test Farm, not Sweet P Pastures

-- Step 1: Check which tenant_id Sweet P Pastures uses
SELECT 
  'Sweet P Pastures Tenant' as info,
  id as tenant_id,
  slug,
  name
FROM tenants 
WHERE slug = 'sweetppastures';

-- Step 2: Show all test products and their current tenant assignment
SELECT 
  'Test Products Current Assignment' as info,
  id,
  name,
  tenant_id,
  (SELECT slug FROM tenants WHERE id = products.tenant_id) as tenant_slug
FROM products 
WHERE id LIKE 'test-%';

-- Step 3: Fix - ensure ALL test products are assigned to Test Farm tenant ONLY
UPDATE products
SET tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
WHERE id LIKE 'test-%';

-- Step 4: Also fix package_bins for test products
UPDATE package_bins
SET tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
WHERE product_id LIKE 'test-%';

-- Step 5: Verify the fix
SELECT 
  '✓ Test Products Now Assigned To' as status,
  COUNT(*) as product_count,
  t.name as tenant_name,
  t.slug as tenant_slug
FROM products p
JOIN tenants t ON p.tenant_id = t.id
WHERE p.id LIKE 'test-%'
GROUP BY t.name, t.slug;

-- Step 6: Verify Sweet P Pastures products are untouched
SELECT 
  'Sweet P Pastures Product Count' as info,
  COUNT(*) as product_count
FROM products 
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'sweetppastures');

-- You may need to refresh your POS screen to see the change
