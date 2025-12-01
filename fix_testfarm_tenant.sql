-- Fix Test Farm admin to point to correct tenant
-- This ensures you see ONLY test farm inventory, not Sweet P Pastures

-- Check current tenant assignment
SELECT 
  'Current Assignment' as status,
  u.email,
  p.tenant_id,
  t.name as tenant_name,
  t.slug as tenant_slug
FROM auth.users u
JOIN profiles p ON u.id = p.id
JOIN tenants t ON p.tenant_id = t.id
WHERE u.email = 'wanderingjack727+testfarm@gmail.com';

-- Update to Test Farm tenant
UPDATE profiles
SET tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'wanderingjack727+testfarm@gmail.com'
);

-- Verify the fix
SELECT 
  '✓ Fixed Assignment' as status,
  u.email,
  p.tenant_id,
  t.name as tenant_name,
  t.slug as tenant_slug
FROM auth.users u
JOIN profiles p ON u.id = p.id
JOIN tenants t ON p.tenant_id = t.id
WHERE u.email = 'wanderingjack727+testfarm@gmail.com';

-- Show Test Farm products to verify
SELECT 
  'Test Farm Products' as info,
  COUNT(*) as product_count
FROM products 
WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' 
  AND is_online = true;

-- After running this, LOG OUT and LOG BACK IN to see Test Farm inventory only
