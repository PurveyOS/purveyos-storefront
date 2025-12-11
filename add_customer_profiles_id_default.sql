-- Add default UUID generation to customer_profiles.id column
-- This allows inserts without explicitly providing an ID

ALTER TABLE public.customer_profiles
ALTER COLUMN id SET DEFAULT gen_random_uuid();
