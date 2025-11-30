-- Add user_id to customer_subscriptions for customer portal integration
-- This links subscriptions to authenticated users

-- Add user_id column
ALTER TABLE customer_subscriptions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_user_id 
ON customer_subscriptions(user_id);

-- Add comment
COMMENT ON COLUMN customer_subscriptions.user_id IS 'Authenticated user ID (NULL for guest subscriptions created before user signup)';

-- Verify column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'customer_subscriptions' AND column_name = 'user_id';
