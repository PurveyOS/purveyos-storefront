-- Create Test Farm admin user DIRECTLY in database (bypassing signup flow)
-- This avoids the payment/checkout session requirement

-- Step 1: Create the auth user directly (only if doesn't exist)
-- Password: TestFarm123! (hashed)
DO $$
DECLARE
  existing_user_id UUID;
  new_user_id UUID;
BEGIN
  -- Check if user already exists
  SELECT id INTO existing_user_id 
  FROM auth.users 
  WHERE email = 'wanderingjack727+testfarm@gmail.com';
  
  IF existing_user_id IS NULL THEN
    -- Create new user
    new_user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      new_user_id,
      'authenticated',
      'authenticated',
      'wanderingjack727+testfarm@gmail.com',
      crypt('TestFarm123!', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      false
    );
    
    RAISE NOTICE '✓ Created new user with ID: %', new_user_id;
  ELSE
    RAISE NOTICE 'User already exists with ID: %', existing_user_id;
  END IF;
END $$;

-- Step 2: Link to test tenant profile
DO $$
DECLARE
  testfarm_user_id UUID;
BEGIN
  -- Get the user ID
  SELECT id INTO testfarm_user_id 
  FROM auth.users 
  WHERE email = 'wanderingjack727+testfarm@gmail.com';
  
  IF testfarm_user_id IS NOT NULL THEN
    -- Create profile linked to test tenant
    INSERT INTO profiles (id, tenant_id, email, role)
    VALUES (testfarm_user_id, 'f47ac10b-58cc-4372-a567-0e02b2c3d479', 'wanderingjack727+testfarm@gmail.com', 'admin')
    ON CONFLICT (id) DO UPDATE SET
      tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      email = 'wanderingjack727+testfarm@gmail.com',
      role = 'admin';
      
    RAISE NOTICE '✓ Test Farm admin created! User ID: %', testfarm_user_id;
  ELSE
    RAISE NOTICE '⚠ Failed to create user';
  END IF;
END $$;

-- Step 3: Configure notifications
UPDATE tenants
SET notification_settings = jsonb_build_object(
  'storefront_url', 'https://testfarm.purveyos.store',
  'notification_email', 'wanderingjack727@gmail.com',
  'notification_enabled', true
)
WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

-- Verification
SELECT 
  '✓ Test Farm Admin Account Created' as status,
  u.email,
  u.email_confirmed_at as confirmed,
  p.role,
  t.name as tenant_name,
  t.slug as tenant_slug
FROM auth.users u
JOIN profiles p ON u.id = p.id
JOIN tenants t ON p.tenant_id = t.id
WHERE u.email = 'wanderingjack727+testfarm@gmail.com';

-- ========================================
-- SUCCESS! You can now login at your POS:
-- Email: wanderingjack727+testfarm@gmail.com
-- Password: TestFarm123!
-- ========================================
