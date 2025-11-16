-- Step 1: Check what tables exist in your database
-- Copy and run this query first to see your actual table names:

SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('tenant', 'Tenant', 'product', 'Product', 'category', 'Category')
ORDER BY table_name, column_name;

-- This will show you:
-- 1. Whether tables are lowercase (tenant, product) or capitalized (Tenant, Product)
-- 2. What columns already exist in each table
-- 3. What data types they use

-- After running the above, update the main script with the correct table names
-- and let me know what the output shows!