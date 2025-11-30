-- Verify your subscription has user_id set correctly

-- 1. Check your user ID
SELECT id, email FROM auth.users WHERE email = 'ccross41585@gmail.com';

-- 2. Check your subscriptions
SELECT 
  id,
  user_id,
  customer_name,
  customer_email,
  status,
  interval_type,
  price_per_interval,
  next_delivery_date,
  created_at,
  subscription_product_id
FROM customer_subscriptions
WHERE customer_email = 'ccross41585@gmail.com'
ORDER BY created_at DESC;

-- 3. Check if subscription_product still exists and is linked
SELECT 
  cs.id as subscription_id,
  cs.user_id,
  cs.customer_email,
  cs.subscription_product_id,
  sp.id as product_id,
  sp.name as product_name,
  sp.is_active
FROM customer_subscriptions cs
LEFT JOIN subscription_products sp ON cs.subscription_product_id = sp.id
WHERE cs.customer_email = 'ccross41585@gmail.com'
ORDER BY cs.created_at DESC;
