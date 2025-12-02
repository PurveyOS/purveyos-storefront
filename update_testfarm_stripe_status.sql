-- Update TestFarm Stripe account status to match actual Stripe dashboard
-- Run this in Supabase SQL Editor

UPDATE tenants 
SET 
  charges_enabled = true,
  payouts_enabled = true,
  requirements_due_count = 0
WHERE slug = 'testfarmstore' 
  AND stripe_account_id = 'acct_1SZf0CGr9v1MfOUq';

-- Verify the update
SELECT 
  name,
  slug,
  stripe_account_id,
  charges_enabled,
  payouts_enabled,
  requirements_due_count
FROM tenants 
WHERE slug = 'testfarmstore';
