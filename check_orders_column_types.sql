-- Check the actual column types in orders table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
  AND column_name IN ('status', 'source', 'tenant_id')
ORDER BY column_name;
