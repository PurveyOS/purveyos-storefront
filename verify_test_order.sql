-- Check if the test order was created
SELECT id, tenant_id, customer_email, status, source, total, created_at
FROM orders
WHERE customer_email = 'test@example.com'
ORDER BY created_at DESC
LIMIT 5;
