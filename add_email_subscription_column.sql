-- Add email subscription flag to customer_profiles table
-- This allows customers to opt-in to email marketing communications

ALTER TABLE public.customer_profiles
ADD COLUMN IF NOT EXISTS subscribed_to_emails boolean DEFAULT false;

-- Create index for easy filtering of subscribed customers
CREATE INDEX IF NOT EXISTS idx_customer_profiles_subscribed_to_emails 
ON public.customer_profiles(tenant_id, subscribed_to_emails)
WHERE subscribed_to_emails = true;

-- Add comment to column
COMMENT ON COLUMN public.customer_profiles.subscribed_to_emails IS 'Flag indicating if customer opted in to email marketing communications';
