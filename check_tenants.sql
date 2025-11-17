-- Check existing tenants
SELECT id, slug, name, storefront_enabled FROM public.tenants LIMIT 10;

-- Check products with is_online flag
SELECT id, name, tenant_id, is_online, qty FROM public.products WHERE is_online = true LIMIT 10;

-- Check storefront_settings
SELECT tenant_id, farm_name, template_id FROM public.storefront_settings LIMIT 10;
