-- Debug queries to check tenant data
-- Run these one by one in Supabase SQL Editor to diagnose the issue:

-- 1. Check if Sweet P Pastures tenant exists
SELECT * FROM public.tenants WHERE slug = 'sweet-p-pastures';

-- 2. Check storefront_enabled status
SELECT slug, storefront_enabled, subscription_tier FROM public.tenants WHERE slug = 'sweet-p-pastures';

-- 3. Check if storefront_settings exist
SELECT * FROM public.storefront_settings 
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures');

-- 4. Check if any products are marked as online
SELECT id, name, is_online, tenant_id FROM public.products 
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures')
AND is_online = true;

-- 5. If no products, check all products for this tenant
SELECT id, name, is_online FROM public.products 
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures');