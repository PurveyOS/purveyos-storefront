-- Add RLS policy to allow customers to view their own orders
-- Run this in Supabase SQL Editor

-- Enable RLS on orders table if not already enabled
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop existing customer policy if it exists
DROP POLICY IF EXISTS "Customers can view their own orders" ON orders;

-- Create policy to allow customers to view their orders by user_id or email
CREATE POLICY "Customers can view their own orders"
ON orders
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  auth.jwt() ->> 'email' = customer_email
);

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'orders' AND policyname = 'Customers can view their own orders';
