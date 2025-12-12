-- Check customer_profiles data in Supabase
SELECT 
  id,
  tenant_id,
  email,
  full_name,
  phone,
  subscribed_to_emails,
  created_at,
  updated_at
FROM public.customer_profiles
WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
ORDER BY updated_at DESC
LIMIT 20;

-- Also check the count
SELECT COUNT(*) as total_count, 
       COUNT(CASE WHEN tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' THEN 1 END) as your_tenant_count
FROM public.customer_profiles;

-- Check last updated timestamp
SELECT MAX(updated_at) as last_updated FROM public.customer_profiles;
