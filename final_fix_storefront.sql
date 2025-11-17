-- Fixed SQL using correct schema from your database

-- 1. Disable RLS for products table too (so storefront can access them)
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_settings DISABLE ROW LEVEL SECURITY;

-- 2. Create storefront settings for Sweet P Pastures
INSERT INTO public.storefront_settings (
  tenant_id, 
  farm_name, 
  farm_description, 
  contact_email, 
  contact_phone,
  template_id,
  hero_heading,
  hero_subtitle
) 
SELECT 
  id,
  'Sweet P Pastures',
  'Premium quality meats from our family farm to your table.',
  'hello@sweetppastures.com',
  '(555) 123-4567',
  'modern',
  'Farm Fresh Goodness',
  'From our pasture to your table.'
FROM public.tenants 
WHERE slug = 'sweet-p-pastures'
ON CONFLICT (tenant_id) DO UPDATE SET
  farm_name = EXCLUDED.farm_name,
  farm_description = EXCLUDED.farm_description,
  updated_at = NOW();

-- 3. Check what products exist (using correct column names)
SELECT id, name, price_per_lb_cents, is_online 
FROM public.products 
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures')
LIMIT 10;

-- 4. Enable products for online sales
UPDATE public.products 
SET is_online = true
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures')
AND (is_online = false OR is_online IS NULL)
AND id IN (
  SELECT id FROM public.products 
  WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures')
  AND (is_online = false OR is_online IS NULL)
  LIMIT 10
);

-- 5. Verify products are now online
SELECT id, name, price_per_lb_cents, is_online 
FROM public.products 
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures')
AND is_online = true;