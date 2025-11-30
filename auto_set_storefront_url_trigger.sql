-- Automatically set storefront_url in notification_settings for new tenants
-- Run this in Supabase SQL Editor

-- Create function to auto-populate storefront URL based on slug
CREATE OR REPLACE FUNCTION auto_set_storefront_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If notification_settings is null or doesn't have storefront_url, set it
  IF NEW.notification_settings IS NULL OR NEW.notification_settings->>'storefront_url' IS NULL THEN
    NEW.notification_settings = jsonb_set(
      COALESCE(NEW.notification_settings, '{}'::jsonb),
      '{storefront_url}',
      to_jsonb('https://' || NEW.slug || '.purveyos.store')
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger that fires before INSERT or UPDATE on tenants
DROP TRIGGER IF EXISTS set_storefront_url_trigger ON tenants;
CREATE TRIGGER set_storefront_url_trigger
  BEFORE INSERT OR UPDATE ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_storefront_url();

-- Update existing tenants that don't have storefront_url set
UPDATE tenants
SET notification_settings = jsonb_set(
  COALESCE(notification_settings, '{}'::jsonb),
  '{storefront_url}',
  to_jsonb('https://' || slug || '.purveyos.store')
)
WHERE notification_settings IS NULL 
   OR notification_settings->>'storefront_url' IS NULL;

-- Verify all tenants now have storefront_url
SELECT 
  name,
  slug,
  notification_settings->>'storefront_url' as storefront_url
FROM tenants
ORDER BY created_at;
