-- Fix customer_profiles table schema and trigger
-- Run this in Supabase SQL Editor

-- 1. Add missing email column and make tenant_id match the tenant from hostname
ALTER TABLE public.customer_profiles 
ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- 2. Update existing records with email from auth.users
UPDATE public.customer_profiles cp
SET email = au.email
FROM auth.users au
WHERE cp.id = au.id AND cp.email IS NULL;

-- 3. Fix the trigger function to properly set tenant_id and email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  detected_tenant_id UUID;
BEGIN
  -- Try to detect tenant from hostname (for storefront signups)
  -- Assumes tenant slug is in the subdomain: sweetppastures.purveyos.store
  -- This will work for storefront signups but needs tenant_id passed for POS signups
  
  -- For storefront customers, we need to get tenant_id from their first subscription or order
  -- For now, just create the profile without tenant_id (can be updated later)
  
  -- Create customer profile with email
  INSERT INTO public.customer_profiles (id, email, full_name, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NULL -- Will be set when they create a subscription or order
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, customer_profiles.full_name);
  
  -- Link any existing subscriptions with matching email
  PERFORM public.link_subscription_to_user(NEW.email, NEW.id);
  
  RETURN NEW;
END;
$$;

-- 4. Update existing customer profiles with proper full_name from auth metadata
UPDATE public.customer_profiles cp
SET full_name = COALESCE(au.raw_user_meta_data->>'full_name', au.email)
FROM auth.users au
WHERE cp.id = au.id;

-- 5. Add index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_profiles_email ON public.customer_profiles(email);

-- 6. Add comment
COMMENT ON COLUMN public.customer_profiles.email IS 'Customer email address (for linking subscriptions)';
COMMENT ON COLUMN public.customer_profiles.tenant_id IS 'Tenant ID (set from first subscription/order, NULL for multi-tenant customers)';
