-- Check and fix RLS policies on customer_subscriptions table

-- 1. Check current RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'customer_subscriptions';

-- 2. Check existing policies
SELECT policyname, cmd, roles, qual
FROM pg_policies 
WHERE tablename = 'customer_subscriptions';

-- 3. Enable RLS if not already enabled
ALTER TABLE customer_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing customer read policy if it exists
DROP POLICY IF EXISTS "Customers can view their own subscriptions" ON customer_subscriptions;

-- 5. Create policy to allow customers to view their subscriptions
CREATE POLICY "Customers can view their own subscriptions"
ON customer_subscriptions
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  auth.jwt() ->> 'email' = customer_email
);

-- 6. Verify the policy
SELECT policyname, cmd, roles, qual
FROM pg_policies 
WHERE tablename = 'customer_subscriptions';
