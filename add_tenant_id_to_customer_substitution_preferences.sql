-- Add tenant_id column to customer_substitution_preferences for data integrity and query performance
ALTER TABLE customer_substitution_preferences
ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE;

-- Backfill tenant_id from existing customer_subscriptions
UPDATE customer_substitution_preferences
SET tenant_id = cs.tenant_id
FROM customer_subscriptions cs
WHERE customer_substitution_preferences.customer_subscription_id = cs.id
  AND customer_substitution_preferences.tenant_id IS NULL;

-- Make tenant_id NOT NULL after backfill
ALTER TABLE customer_substitution_preferences
ALTER COLUMN tenant_id SET NOT NULL;

-- Add index for query performance
CREATE INDEX IF NOT EXISTS idx_customer_substitution_preferences_tenant_id 
ON customer_substitution_preferences(tenant_id);

-- Add composite index for common queries
CREATE INDEX IF NOT EXISTS idx_customer_substitution_preferences_tenant_subscription 
ON customer_substitution_preferences(tenant_id, customer_subscription_id);
