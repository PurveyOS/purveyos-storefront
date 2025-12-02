-- Test if anonymous can insert an order with the same data
SET ROLE anon;

INSERT INTO orders (
  tenant_id,
  customer_email,
  customer_name,
  customer_phone,
  status,
  total,
  total_cents,
  subtotal_cents,
  tax_cents,
  source,
  note
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'test@example.com',
  'Test Customer',
  '1234567890',
  'paid',
  9.99,
  999,
  999,
  0,
  'storefront',
  'Test order'
);

RESET ROLE;
