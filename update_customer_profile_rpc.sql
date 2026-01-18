-- Drop the existing function if it exists (with old return type)
DROP FUNCTION IF EXISTS public.update_customer_profile_by_email(text, uuid, text, text, text, text, boolean);

-- Create RPC function to update customer profile by email+tenant
-- This bypasses RLS by running as service role and can find orphaned profiles
CREATE OR REPLACE FUNCTION public.update_customer_profile_by_email(
  p_email TEXT,
  p_tenant_id UUID,
  p_full_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_default_delivery_address TEXT DEFAULT NULL,
  p_default_delivery_notes TEXT DEFAULT NULL,
  p_email_notifications BOOLEAN DEFAULT NULL
)
RETURNS TABLE(
  profile_id UUID,
  profile_email TEXT,
  profile_tenant_id UUID,
  profile_full_name TEXT,
  profile_phone TEXT,
  profile_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Find the profile by email+tenant
  SELECT customer_profiles.id INTO v_profile_id
  FROM customer_profiles
  WHERE customer_profiles.email = p_email
    AND customer_profiles.tenant_id = p_tenant_id
  LIMIT 1;
  
  -- If profile doesn't exist, return empty
  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Update the profile with provided data (only non-null fields)
  UPDATE customer_profiles
  SET
    full_name = COALESCE(p_full_name, customer_profiles.full_name),
    phone = COALESCE(p_phone, customer_profiles.phone),
    default_delivery_address = COALESCE(p_default_delivery_address, customer_profiles.default_delivery_address),
    default_delivery_notes = COALESCE(p_default_delivery_notes, customer_profiles.default_delivery_notes),
    email_notifications = COALESCE(p_email_notifications, customer_profiles.email_notifications),
    updated_at = NOW()
  WHERE customer_profiles.id = v_profile_id;
  
  -- Return the updated profile
  RETURN QUERY
  SELECT 
    customer_profiles.id,
    customer_profiles.email,
    customer_profiles.tenant_id,
    customer_profiles.full_name,
    customer_profiles.phone,
    customer_profiles.updated_at
  FROM customer_profiles
  WHERE customer_profiles.id = v_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.update_customer_profile_by_email TO authenticated;
