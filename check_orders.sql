-- Check if order was created
SELECT 
  id,
  customer_name,
  customer_email,
  status,
  total,
  created_at
FROM orders
WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
ORDER BY created_at DESC
LIMIT 5;
