-- Rename subscribed_to_emails to email_notifications for consistency
-- This matches the naming used in the storefront customer profile setup

-- Rename the column
ALTER TABLE public.customer_profiles 
RENAME COLUMN subscribed_to_emails TO email_notifications;

-- Drop old index
DROP INDEX IF EXISTS idx_customer_profiles_subscribed_to_emails;

-- Create new index with updated name
CREATE INDEX IF NOT EXISTS idx_customer_profiles_email_notifications 
ON public.customer_profiles(tenant_id, email_notifications)
WHERE email_notifications = true;

-- Update column comment
COMMENT ON COLUMN public.customer_profiles.email_notifications IS 'Flag indicating if customer opted in to email marketing communications';
