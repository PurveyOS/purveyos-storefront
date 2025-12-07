# Stock Badges & Customer Email Notifications

## Overview
Two major improvements to the PurveyOS Storefront to enhance customer experience and communication:

1. **Stock Count Badges** - Visual inventory display on product cards
2. **Customer Order Confirmations** - Automatic email notifications when orders are received

---

## 1. Stock Count Badges

### What's New
Product cards now display real-time inventory counts:
- **Fixed-price items (ea)**: Shows remaining stock count
- **Weight-based items (lb)**: Shows available package count

### Visual Design
- Badge positioned bottom-right of product image
- Uses tenant's primary color from settings for branding consistency
- Shows count with unit label (e.g., "5 left" or "8 packages")
- Includes tooltip with full description on hover
- Updates in real-time as customers add items to cart

### Implementation Details

**File**: `src/components/ProductCard.tsx`

**For Fixed-Price Items:**
```tsx
{product.inventory - quantityInCart} {product.unit || 'left'}
```
- Subtracts items already in customer's cart
- Shows accurate remaining inventory

**For Weight-Based Items:**
```tsx
{localBins.reduce((sum, bin) => sum + (bin.qty || 0), 0)} packages
```
- Counts total available packages across all weight options
- Updates as packages are selected from modal
- Reflects real-time availability

### Styling
```tsx
style={{ backgroundColor: primaryColor }}
```
- Primary color from tenant settings
- White text for contrast
- Rounded pill shape (border-radius: full)
- Shadow for visibility over product images

### When Badge Appears
✅ Fixed-price items: Always visible if inventory > 0  
✅ Weight-based items: Always visible if packages available  
❌ Sold out items: Badge hidden  
❌ Low stock warning takes precedence  

---

## 2. Customer Order Confirmation Emails

### What's New
When a storefront order is successfully created, customers now receive:
1. **Tenant Alert** (existing): Business owner gets notified of new order
2. **Customer Confirmation** (new): Customer gets order received acknowledgment

### Email Content

**Recipient**: Customer email address from order form

**Subject**: `Order Confirmation - [Farm Name]`

**Body**:
```
Thank you for your order!

Your order has been received by [Farm Name].

Order Details:
- Order ID: [8-char ID]
- Name: [Customer name]
- [Pickup/Delivery Location details]
- Total: [Amount]

We'll notify you when your order is ready for pickup/delivery.

Thank you for supporting [Farm Name]!

Questions? Reply to this email or contact us.
```

### Implementation Details

**Modified Files**:
- `supabase/functions/create-storefront-order/index.ts`
- `supabase/functions/order-created-notify/index.ts` (huckster-ui)

**Flow**:
1. Order successfully created in database
2. Call `order-created-notify` for tenant (existing)
3. Call `order-created-notify` with `notifyCustomer: true` for customer (new)
4. Both notifications logged to `notifications_log` table

**Error Handling**:
- Non-fatal: Email failures don't prevent order creation
- Each notification logged separately
- Console logs for debugging

### Configuration

**Required Environment Variables**:
- `SENDGRID_API_KEY` - SendGrid API key for email delivery
- Same as existing tenant notifications

**Email From Address**:
```
From: orders@purveyos.io
Name: PurveyOS Notifications
```

### Integration with Existing System

**Reuses**: 
- Same `order-created-notify` Edge Function
- Same SendGrid configuration
- Same `notifications_log` table

**Changes**:
- Added `notifyCustomer: boolean` flag to request body
- Function now handles both flows based on flag
- Maintains full backward compatibility

### Testing Checklist

- [ ] Create test order with customer email
- [ ] Verify tenant receives new order alert
- [ ] Verify customer receives confirmation email
- [ ] Check both emails logged in notifications_log
- [ ] Test with invalid email (should fail gracefully)
- [ ] Verify order creation succeeds even if emails fail
- [ ] Check email content formatting and variables

---

## Files Modified

### purveyos-storefront/
1. **src/components/ProductCard.tsx**
   - Added stock count badges for both pricing modes
   - Integrated quantityInCart tracking for fixed items
   - Real-time package count updates from localBins

2. **supabase/functions/create-storefront-order/index.ts**
   - Added customer notification call after tenant alert
   - Passes notifyCustomer flag to order-created-notify

### farmpos_label_starter_v3/huckster-ui/
1. **supabase/functions/order-created-notify/index.ts**
   - Added notifyCustomer interface field
   - Implemented dual-path logic (tenant vs customer)
   - Customer-specific email template
   - Notification logging for both types

---

## Deployment Steps

1. **Storefront Updates**
   - Deploy `src/components/ProductCard.tsx`
   - Deploy `supabase/functions/create-storefront-order/index.ts`

2. **Backend Functions**
   - Redeploy `order-created-notify` function:
   ```bash
   npx supabase functions deploy order-created-notify --project-ref [PROJECT_REF]
   ```

3. **Verification**
   - Test stock badge display on storefront
   - Create test order and check both emails received
   - Monitor email delivery logs in SendGrid dashboard

---

## Future Enhancements

Potential improvements:
- [ ] SMS notifications for customers (Twilio integration)
- [ ] Order tracking link in customer email
- [ ] Customizable email templates per tenant
- [ ] Customer notification preferences (email/SMS)
- [ ] Order ready notification to customer
- [ ] Stock level alerts to tenant when inventory drops

---

## Support

**Stock Badge Issues**:
- Check `primaryColor` is properly passed from tenant settings
- Verify `quantityInCart` state updates correctly
- Monitor browser console for React errors

**Email Issues**:
- Check `SENDGRID_API_KEY` environment variable set
- Review SendGrid dashboard for delivery failures
- Check `notifications_log` table for attempts
- Verify customer email addresses in order form

