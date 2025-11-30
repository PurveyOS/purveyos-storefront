-- Update tenant notification settings with correct storefront URL
-- Run this in Supabase SQL Editor

-- Update Sweet P Pastures tenant with correct storefront URL
UPDATE tenants
SET notification_settings = jsonb_set(
  COALESCE(notification_settings, '{}'::jsonb),
  '{storefront_url}',
  '"https://sweetppastures.purveyos.store"'
)
WHERE slug = 'sweetppastures';

-- Verify the update
SELECT 
  name,
  slug,
  notification_settings->>'storefront_url' as storefront_url,
  notification_settings->>'pickup_location' as pickup_location,
  notification_settings->>'pickup_hours' as pickup_hours
FROM tenants
WHERE slug = 'sweetppastures';
