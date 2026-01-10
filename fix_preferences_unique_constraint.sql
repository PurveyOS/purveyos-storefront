-- Drop old incorrect unique constraint that doesn't include chosen_product_id
-- This was preventing customers from selecting multiple products from the same group
ALTER TABLE customer_substitution_preferences
DROP CONSTRAINT IF EXISTS customer_substitution_prefere_customer_subscription_id_subs_key;

-- Add correct unique constraint that includes chosen_product_id
-- This allows multiple products from the same group (e.g., chicken AND bacon from protein_choice)
ALTER TABLE customer_substitution_preferences
DROP CONSTRAINT IF EXISTS unique_preference;

ALTER TABLE customer_substitution_preferences
ADD CONSTRAINT unique_preference 
  UNIQUE (customer_subscription_id, subscription_box_item_id, chosen_product_id, delivery_number);

-- Verify the constraint
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'customer_substitution_preferences'::regclass 
  AND contype = 'u';
