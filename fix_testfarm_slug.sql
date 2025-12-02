-- Fix testfarm slug to match Cloudflare subdomain
-- Run this in Supabase SQL Editor

-- Update just the slug
UPDATE tenants 
SET slug = 'testfarmstore'
WHERE slug = 'testfarm';

-- Verify the update
SELECT *
FROM tenants 
WHERE slug = 'testfarmstore';
