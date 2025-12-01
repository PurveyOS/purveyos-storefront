-- Comprehensive diagnosis of tenant isolation issue
-- This will show us exactly what's wrong with the profile/tenant assignments

-- ========================================
-- STEP 1: Show ALL users and their tenant assignments
-- ========================================
SELECT 
  'All User/Tenant Assignments' as section,
  u.email,
  u.id as user_id,
  p.tenant_id,
  t.name as tenant_name,
  t.slug as tenant_slug,
  p.role
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
LEFT JOIN tenants t ON p.tenant_id = t.id
ORDER BY u.email;

-- ========================================
-- STEP 2: Show tenant UUIDs for reference
-- ========================================
SELECT 
  'Tenant Reference' as section,
  id as tenant_uuid,
  slug,
  name
FROM tenants
ORDER BY name;

-- ========================================
-- STEP 3: Check product counts by tenant
-- ========================================
SELECT 
  'Product Counts by Tenant' as section,
  t.name as tenant_name,
  t.slug,
  COUNT(p.id) as product_count
FROM tenants t
LEFT JOIN products p ON t.id = p.tenant_id
GROUP BY t.id, t.name, t.slug
ORDER BY t.name;

-- ========================================
-- STEP 4: Show test products specifically
-- ========================================
SELECT 
  'Test Products Detail' as section,
  p.id,
  p.name,
  p.tenant_id,
  t.slug as assigned_to_tenant
FROM products p
LEFT JOIN tenants t ON p.tenant_id = t.id
WHERE p.id LIKE 'test-%'
ORDER BY p.name;

-- ========================================
-- DIAGNOSIS SUMMARY
-- ========================================
-- After running this, look for:
-- 1. Does wanderingjack727+testfarm@gmail.com point to Test Farm (f47ac10b-58cc-4372-a567-0e02b2c3d479)?
-- 2. Does your Sweet P email point to Sweet P tenant?
-- 3. Are test products assigned to Test Farm tenant?
-- 4. If ANY of these are wrong, we'll fix them next
