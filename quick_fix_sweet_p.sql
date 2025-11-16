-- Quick fix for Sweet P Pastures storefront
-- Run this in Supabase SQL Editor

-- 1. Enable storefront for Sweet P Pastures
UPDATE public.tenants 
SET storefront_enabled = true 
WHERE slug = 'sweet-p-pastures';

-- 2. Add subscription_tier if missing
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'basic';

UPDATE public.tenants 
SET subscription_tier = 'pro_webhosting' 
WHERE slug = 'sweet-p-pastures';

-- 3. Check if Sweet P Pastures has storefront settings, if not create them
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
  t.id,
  'Sweet P Pastures',
  'Premium quality meats from our family farm to your table.',
  'hello@sweetppastures.com',
  '(555) 123-4567',
  'modern',
  'Farm Fresh Goodness',
  'From our pasture to your table.'
FROM public.tenants t
WHERE t.slug = 'sweet-p-pastures'
ON CONFLICT (tenant_id) DO UPDATE SET
  farm_name = EXCLUDED.farm_name,
  farm_description = EXCLUDED.farm_description,
  updated_at = NOW();

-- 4. Enable some existing products for online if any exist
UPDATE public.products 
SET is_online = true
WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures')
AND is_online = false
AND id IN (
  SELECT id FROM public.products 
  WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'sweet-p-pastures')
  AND is_online = false
  LIMIT 3
);