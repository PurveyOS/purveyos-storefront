-- Fix customer_profiles table to have proper primary key for upsert
-- This allows the upsert operation to work correctly

-- Check if primary key exists
DO $$ 
BEGIN
    -- Add primary key if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'customer_profiles_pkey'
    ) THEN
        ALTER TABLE public.customer_profiles
        ADD PRIMARY KEY (id);
    END IF;
END $$;

-- Ensure id column is NOT NULL (required for primary key)
ALTER TABLE public.customer_profiles
ALTER COLUMN id SET NOT NULL;

-- Add unique constraint on email + tenant_id to prevent duplicate emails per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_email_tenant 
ON public.customer_profiles(email, tenant_id);
