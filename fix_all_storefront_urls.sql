-- Check and fix all tenant storefront URLs
-- This will show any tenants with incorrect storefront URLs and fix them

-- First, check which tenants have the wrong URL
SELECT 
  id,
  name,
  slug,
  notification_settings->>'storefront_url' as current_storefront_url,
  'https://' || slug || '.purveyos.store' as should_be
FROM tenants
WHERE notification_settings->>'storefront_url' != 'https://' || slug || '.purveyos.store'
   OR notification_settings->>'storefront_url' IS NULL;

-- Fix all incorrect storefront URLs to match the tenant slug
UPDATE tenants
SET notification_settings = jsonb_set(
  COALESCE(notification_settings, '{}'::jsonb),
  '{storefront_url}',
  to_jsonb('https://' || slug || '.purveyos.store')
)
WHERE notification_settings->>'storefront_url' != 'https://' || slug || '.purveyos.store'
   OR notification_settings->>'storefront_url' IS NULL;

-- Verify all are now correct
SELECT 
  id,
  name,
  slug,
  notification_settings->>'storefront_url' as storefront_url,
  CASE 
    WHEN notification_settings->>'storefront_url' = 'https://' || slug || '.purveyos.store' 
    THEN '✓ Correct'
    ELSE '✗ Still Wrong'
  END as status
FROM tenants
ORDER BY created_at DESC;
