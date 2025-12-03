-- Create missing customer_profiles for existing auth users
-- This handles users who signed up before the trigger was active

INSERT INTO public.customer_profiles (id, email, full_name, tenant_id)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', au.email),
  NULL -- Will be set when they complete profile or make first order
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.customer_profiles cp WHERE cp.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- Verify the profile was created
SELECT id, email, full_name, phone, tenant_id, created_at
FROM public.customer_profiles
WHERE email = 'sweetppastures@gmail.com';
