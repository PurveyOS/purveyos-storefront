-- Configure email notifications for test storefront

-- Set notification email for test tenant
UPDATE tenants
SET notification_settings = jsonb_build_object(
  'storefront_url', 'https://testfarm.purveyos.store',
  'notification_email', 'wanderingjack727@gmail.com',  -- CHANGE THIS to your email
  'notification_enabled', true
)
WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- Verify settings
SELECT 
  slug,
  name,
  notification_settings->>'notification_email' as notification_email,
  notification_settings->>'storefront_url' as storefront_url
FROM tenants 
WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- Optional: Test the notification system by checking the order-notify function
-- When an order is placed, the Edge Function will:
-- 1. Look up tenant notification_settings
-- 2. Send email to notification_email address
-- 3. Log the notification in notifications_log table

-- ========================================
-- CREATE POS ADMIN USER FOR TEST TENANT
-- ========================================
-- This creates a complete admin account to access the POS system for testfarm
-- POS Login: wanderingjack727+testfarm@gmail.com / TestFarm123!
-- Note: Gmail treats +testfarm as the same inbox, so emails go to wanderingjack727@gmail.com

DO $$
DECLARE
  admin_user_id UUID;
BEGIN
  -- Check if admin user already exists
  SELECT id INTO admin_user_id FROM auth.users WHERE email = 'wanderingjack727+testfarm@gmail.com';
  
  IF admin_user_id IS NOT NULL THEN
    -- Create or update profile for admin user
    INSERT INTO profiles (id, tenant_id, role)
    VALUES (admin_user_id, 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'admin')
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      role = EXCLUDED.role;
      
    RAISE NOTICE '✓ POS admin profile created/updated for: %', admin_user_id;
  ELSE
    RAISE NOTICE '⚠ Admin user does not exist yet. Sign up at the POS system with: wanderingjack727+testfarm@gmail.com / TestFarm123!';
    RAISE NOTICE '   Then run this script again to link the profile to the test tenant.';
  END IF;
END $$;

-- Verification
SELECT 
  'POS Admin Account' as account_type,
  u.email,
  p.role,
  t.name as tenant_name,
  t.slug as tenant_slug
FROM auth.users u
LEFT JOIN profiles p ON u.id = p.id
LEFT JOIN tenants t ON p.tenant_id = t.id
WHERE u.email = 'wanderingjack727+testfarm@gmail.com';

-- ========================================
-- INSTRUCTIONS:
-- ========================================
-- 1. Sign up at your POS system with: wanderingjack727+testfarm@gmail.com / TestFarm123!
--    (Gmail delivers to wanderingjack727@gmail.com but treats it as unique account)
-- 2. Run this SQL script to link the admin to test tenant (testfarm)
-- 3. Access POS with the test tenant's isolated inventory
-- 4. Customer storefront: https://testfarm.purveyos.store (test@testfarm.com)
-- 5. All test data is isolated - won't affect your personal inventory
