# Order Confirmation Emails - Storefront Implementation

## Overview
The storefront now sends order confirmation emails automatically after any order is placed, regardless of payment method.

## What Was Implemented

### 1. **Created `order-notify` Edge Function**
   - **Location**: `supabase/functions/order-notify/index.ts`
   - **Purpose**: Send order confirmation and ready notifications
   - **Features**:
     - Sends confirmation email immediately after order creation
     - Separates NOW (in-stock) vs LATER (pre-order) items
     - Includes fulfillment details and pickup/delivery info
     - Non-blocking - email failures don't fail the order
     - Comprehensive error handling and logging
     - SMS notification support (if Twilio configured)
     - Logs all notifications to `notifications_log` table

### 2. **Updated `create-storefront-order` Edge Function**
   - **File**: `supabase/functions/create-storefront-order/index.ts`
   - **Change**: Replaced `order-created-notify` calls with `order-notify`
   - **Trigger**: Automatically calls notification after order is created
   - **Payload**:
     ```typescript
     {
       orderId: string,
       emailType: 'order_confirmation',
       triggerSource: 'storefront'
     }
     ```

## Payment Methods Supported
✅ Venmo
✅ Zelle
✅ Card (Stripe)
✅ Cash
✅ Any custom payment method

**Confirmation email is sent for ALL payment methods - no exceptions**

## Email Content

### Order Confirmation Email
- Order ID and placement date
- Items separated into two sections:
  - **READY NOW**: In-stock, reserved items
  - **LATER**: Pre-order items (not yet available)
- Important notes about pre-orders and pricing flexibility
- Pickup/delivery location and hours
- Order totals (subtotal, tax, total)
- Link to storefront for order management
- Thank you message with farm name

### Example Email Structure
```
Hi [Customer Name],

Thanks! We received your order from [Farm Name].

ORDER [order-id]
Placed: [date]

READY NOW (Reserved / In-stock)
• 2 x Tomatoes — $10.00
• 1 x Lettuce — $5.00

LATER (Pre-order / We'll fill when available)
• 1 x Carrots — $8.00

Important:
• LATER items are flexible — final weight and total may change slightly at fulfillment.
• We'll notify you when your order is ready.

Pickup info:
Location: [pickup location]
Hours: [pickup hours]

Totals:
Subtotal: $23.00
Tax: $1.95
Total: $24.95
```

## How It Works

### 1. **Order Creation Flow**
```
Customer submits order (any payment method)
    ↓
create-storefront-order edge function
    ↓
Order inserted into database
    ↓
Calls order-notify with { orderId, emailType: 'order_confirmation' }
    ↓
Email sent to customer
    ↓
Notification logged in notifications_log
    ↓
Order creation completes (even if email fails)
```

### 2. **Error Handling**
- Email failures are **non-fatal** - order still succeeds
- All errors logged with emoji indicators for easy debugging
- Notifications logged to `notifications_log` table with status
- Missing emails skipped gracefully

## Configuration

### Environment Variables Required
- `SENDGRID_API_KEY` - SendGrid API key for email delivery
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `TWILIO_ACCOUNT_SID` (optional) - For SMS notifications
- `TWILIO_AUTH_TOKEN` (optional) - For SMS notifications
- `TWILIO_FROM_NUMBER` (optional) - For SMS notifications

### Tenant Notification Settings
These are read from `tenants.notification_settings`:
```json
{
  "pickup_location": "123 Main St, Suite 100",
  "pickup_hours": "Wed-Sun 4-7pm",
  "special_instructions": "Ring doorbell, don't knock",
  "storefront_url": "https://farmname.purveyos.io"
}
```

## Notification Logging

All notifications are logged to the `notifications_log` table:
```
tenant_id: [farm id]
order_id: [order id]
channel: 'email' | 'sms'
recipient: [customer email/phone]
status: 'sent' | 'failed' | 'skipped'
email_type: 'order_confirmation' | 'order_ready'
trigger_source: 'storefront'
error_message: [error details if failed]
created_at: [timestamp]
```

## Testing

### 1. **Verify Deployment**
```bash
# Check if order-notify is deployed
supabase functions list --project-ref <project-id>

# Should see: order-notify (running)
```

### 2. **Test Email Delivery**
```bash
# Make a test order via storefront
# Check email inbox for confirmation

# Check notification logs:
SELECT * FROM notifications_log 
WHERE email_type = 'order_confirmation' 
ORDER BY created_at DESC 
LIMIT 1;
```

### 3. **Verify Edge Function**
```bash
# Direct edge function test:
curl -X POST https://<project>.functions.supabase.co/order-notify \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-id",
    "emailType": "order_confirmation",
    "triggerSource": "storefront"
  }'
```

## Monitoring

### Check Email Send Success Rate
```sql
SELECT 
  DATE(created_at) as date,
  status,
  COUNT(*) as count
FROM notifications_log
WHERE email_type = 'order_confirmation'
  AND channel = 'email'
GROUP BY DATE(created_at), status
ORDER BY date DESC;
```

### Find Failed Emails
```sql
SELECT 
  order_id,
  recipient,
  status,
  error_message,
  created_at
FROM notifications_log
WHERE email_type = 'order_confirmation'
  AND status = 'failed'
ORDER BY created_at DESC;
```

## Key Features

✅ **Universal Coverage**: Emails sent for ALL payment methods
✅ **Non-Blocking**: Email failures don't interrupt order creation
✅ **Smart Formatting**: NOW vs LATER item separation
✅ **Comprehensive Info**: Pickup/delivery details included
✅ **Error Resilient**: Graceful degradation for missing data
✅ **Well-Logged**: All notifications tracked in database
✅ **Customizable**: Farm-specific settings per tenant
✅ **SMS Ready**: SMS notifications supported (if configured)

## Files Changed

| File | Changes |
|------|---------|
| `supabase/functions/order-notify/index.ts` | **NEW** - Order notification edge function (367 lines) |
| `supabase/functions/create-storefront-order/index.ts` | Updated notification calls to use order-notify |

## Next Steps

1. ✅ Deploy order-notify edge function
2. ✅ Test with a real order
3. ✅ Verify email arrives in customer inbox
4. ✅ Monitor notifications_log for delivery status
5. ⏳ Optional: Configure SMS notifications (Twilio)
6. ⏳ Optional: Add order-ready notifications when fulfilling

## Rollback Plan

If issues occur:
```bash
# Revert to previous version
git revert HEAD

# Redeploy
supabase functions deploy order-notify
```

## Support

**Edge Function Logs**:
- Supabase Dashboard → Edge Functions → order-notify → Logs
- Look for emoji indicators: 🔔 📧 ✓ ❌ ⚠️

**Database Logs**:
```sql
SELECT * FROM notifications_log 
ORDER BY created_at DESC 
LIMIT 20;
```

---

**Status**: Ready for production ✅
**Deployed**: Yes
**Payment Methods**: All (Venmo, Zelle, Card, Cash)
