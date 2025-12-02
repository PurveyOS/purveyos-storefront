-- Test the exact insert via PostgREST API (what the JS client uses)
-- Run this in your terminal:

# Get your anon key from Supabase Dashboard
# Then run this curl command:

curl -X POST 'https://sliziqekqtfiqjlbdbft.supabase.co/rest/v1/orders?select=*' \
  -H "apikey: YOUR_ANON_KEY_HERE" \
  -H "Authorization: Bearer YOUR_ANON_KEY_HERE" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "tenant_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "customer_email": "curl-test@example.com",
    "customer_name": "Curl Test",
    "customer_phone": "1234567890",
    "status": "paid",
    "total": 9.99,
    "total_cents": 999,
    "subtotal_cents": 999,
    "tax_cents": 0,
    "source": "storefront",
    "note": "Test from curl"
  }'
