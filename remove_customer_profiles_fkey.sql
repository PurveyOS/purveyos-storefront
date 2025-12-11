-- Remove foreign key constraint from customer_profiles.id
-- This allows guest customers (non-auth users) to have profiles

-- Drop the foreign key constraint
ALTER TABLE public.customer_profiles
DROP CONSTRAINT IF EXISTS customer_profiles_id_fkey;

-- The id column can now be any UUID, not just auth.users IDs
