-- Update existing subscription to link to your user account
-- Replace the email with your actual email

-- First, find your user_id
SELECT id, email FROM auth.users WHERE email = 'ccross41585@gmail.com';

-- Update the subscription created today to link to your user
UPDATE customer_subscriptions
SET user_id = (SELECT id FROM auth.users WHERE email = 'ccross41585@gmail.com')
WHERE customer_email = 'ccross41585@gmail.com'
  AND created_at >= CURRENT_DATE;

-- Verify the update
SELECT id, customer_name, customer_email, user_id, status, created_at
FROM customer_subscriptions
WHERE customer_email = 'ccross41585@gmail.com'
ORDER BY created_at DESC
LIMIT 5;
