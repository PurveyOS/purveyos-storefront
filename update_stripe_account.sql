-- Update to use the Stripe account that has transfers enabled (jack ryan account)
-- Run this in Supabase SQL Editor

UPDATE tenants 
SET 
  stripe_account_id = 'acct_1SZboCGneVdrGxH3',
  charges_enabled = true,
  payouts_enabled = true
WHERE slug = 'testfarmstore';

-- Verify the update
SELECT 
  name,
  slug,
  stripe_account_id,
  charges_enabled,
  payouts_enabled
FROM tenants 
WHERE slug = 'testfarmstore';
