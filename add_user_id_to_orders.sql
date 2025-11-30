-- Add user_id column to orders table to link orders to authenticated users
-- Run this in Supabase SQL Editor

-- Add user_id column (foreign key to auth.users)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Add comment
COMMENT ON COLUMN orders.user_id IS 'Authenticated user ID (NULL for guest checkouts)';

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'user_id';
