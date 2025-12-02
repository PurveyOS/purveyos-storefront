-- Debug: Check tenant ID that the storefront is using
-- Run this in Supabase SQL Editor

SELECT 
  id,
  slug,
  name,
  stripe_account_id,
  charges_enabled,
  payouts_enabled
FROM tenants 
WHERE slug = 'testfarmstore';
