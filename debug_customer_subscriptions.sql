-- Check if customer_subscriptions table exists
SELECT table_name, table_schema 
FROM information_schema.tables 
WHERE table_name = 'customer_subscriptions';

-- Check table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'customer_subscriptions'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'customer_subscriptions';

-- Check if RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename = 'customer_subscriptions';

-- Check recent subscription_products to verify they exist
SELECT id, name, tenant_id, is_active, price_per_interval, interval_type
FROM subscription_products
WHERE is_active = true
ORDER BY created_at DESC
LIMIT 5;
