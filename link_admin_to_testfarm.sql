-- Link your existing POS admin account to the Test Farm tenant
-- Run this after you've signed up/logged into the POS system

-- Find your user ID and link it to test tenant
DO $$
DECLARE
  your_user_id UUID;
BEGIN
  -- Replace with YOUR actual POS login email
  SELECT id INTO your_user_id FROM auth.users WHERE email = 'YOUR_ACTUAL_EMAIL@example.com';
  
  IF your_user_id IS NOT NULL THEN
    -- Link your account to test tenant
    INSERT INTO profiles (id, tenant_id, role)
    VALUES (your_user_id, 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'admin')
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      role = 'admin';
      
    RAISE NOTICE '✓ Your account is now linked to Test Farm tenant!';
  ELSE
    RAISE NOTICE '⚠ User not found. Make sure you entered the correct email.';
  END IF;
END $$;

-- Verify the link
SELECT 
  u.email,
  p.role,
  t.name as tenant_name,
  t.slug as tenant_slug
FROM auth.users u
JOIN profiles p ON u.id = p.id
JOIN tenants t ON p.tenant_id = t.id
WHERE p.tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
