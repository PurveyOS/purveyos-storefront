-- Test RLS filtering as a specific user
-- Run this to verify RLS is working correctly

-- 1. Test as Sweet P user
SET ROLE authenticated;
SET request.jwt.claim.sub = '70fa725d-ae5e-415e-90af-9b8b02d2b689'; -- sweetppastures@gmail.com

SELECT 'Products visible to Sweet P user' as test,
       COUNT(*) as product_count
FROM products;

SELECT 'Sweet P Products Detail' as test,
       id, name, tenant_id
FROM products
LIMIT 10;

-- 2. Test as Test Farm user  
SET request.jwt.claim.sub = 'fcde4ec9-8dd1-4e46-b598-00c34e0b2f2f'; -- wanderingjack727+testfarm@gmail.com

SELECT 'Products visible to Test Farm user' as test,
       COUNT(*) as product_count
FROM products;

SELECT 'Test Farm Products Detail' as test,
       id, name, tenant_id
FROM products
LIMIT 10;

-- Reset
RESET ROLE;
