# Storefront → POS Subscription Integration (COMPLETED)

## Summary

This integration enables customers to order subscriptions online (purveyos-storefront) and allows POS tenants (Huckster-UI) to fulfill those orders with actual weight-bin selections.

---

## Architecture

### **Two Order Systems**

| System | Table | Status | Use Case |
|--------|-------|--------|----------|
| **Storefront** | `orders` + `order_lines` | pending → completed | Customer online orders (may be estimates) |
| **POS** | `sales` + `sale_lines` | pending → PAID → VOID | Internal point-of-sale transactions |
| **Subscriptions** | `customer_subscriptions` → `subscription_deliveries` | Spans both | Recurring deliveries, linked via `order_id` (UUID) → `orders.id` |

### **Data Flow: Storefront → POS**

```
Customer submits subscription order online
  ↓
Edge function create-storefront-order:
  1. Check idempotency on stripe_payment_intent_id
  2. Create orders record (source='storefront', is_subscription_order=true)
  3. Create customer_subscriptions with deliveries_fulfilled=0
  4. Create subscription_deliveries (delivery#1, status='scheduled', order_id=orders.id)
  5. Create customer_substitution_preferences (normalized customer choices)
  ↓
POS tenant opens OrdersListScreen:
  - Filters for orders.source='storefront' AND orders.is_subscription_order=true
  - Shows "🌐 Storefront Subscription" badge
  ↓
Tenant clicks "Fulfill Delivery #1":
  - Loads customer_substitution_preferences (customer's product selections)
  - Opens SubscriptionBoxPackageSelectionModal
  - Tenant selects actual weight bins (can override customer choices)
  ↓
On save:
  - Updates subscription_deliveries.status='fulfilled'
  - Increments customer_subscriptions.deliveries_fulfilled
  - Syncs to Supabase
```

---

## Implementation Details

### **PHASE 1: Database Migration** ✅ COMPLETED

**File:** `purveyos-storefront/supabase/migrations/20260109_add_storefront_subscription_integration.sql`

**What it does:**
- Adds `stripe_payment_intent_id` column to `orders` table (if missing)
- Creates UNIQUE index on `(tenant_id, stripe_payment_intent_id)` for idempotency
- Verifies `source` column on `orders` table
- Verifies `stripe_payment_intent_id` on `customer_subscriptions` table

**Why these changes:**
- Idempotency: Stripe ID is globally unique, preventing duplicate orders on retries
- Tenant scoping: Index includes `tenant_id` to prevent cross-tenant collisions
- Linkage: `stripe_payment_intent_id` tracks payment → subscription relationship

---

### **PHASE 2: Edge Function Enhancements** ✅ COMPLETED

**File:** `purveyos-storefront/supabase/functions/create-storefront-order/index.ts`

**What was added:**

1. **Idempotency Check** (lines ~115-130)
   ```typescript
   if (orderRequest.stripePaymentIntentId) {
     const { data: existingOrder } = await supabaseAdmin
       .from('orders')
       .select('id')
       .eq('tenant_id', orderRequest.tenantId)
       .eq('stripe_payment_intent_id', orderRequest.stripePaymentIntentId)
       .maybeSingle()
     
     if (existingOrder) return { orderId: existingOrder.id, success: true, idempotent: true }
   }
   ```

2. **Updated OrderRequest Interface** (lines ~25-50)
   - Added `stripePaymentIntentId?: string`
   - Added `duration?: number`
   - Added `substitutions?: Record<string, any>`

3. **Updated orders.insert()** (line ~230)
   - Added `stripe_payment_intent_id: orderRequest.stripePaymentIntentId || null`
   - Ensured `is_subscription_order: orderRequest.subscription?.enabled ?? false`

4. **Subscription Deliveries Creation** (lines ~570-635)
   - Fetches `subscription_box_items` template
   - Builds `custom_items` as JSONB object (not stringified):
     ```typescript
     const customItems = {
       snapshot: { client_generated_id, subscription_product_id, choices },
       components: [...box items with substitution groups...],
     }
     ```
   - Creates `subscription_deliveries`:
     - `order_id = orderId` (UUID FK to orders.id) ✅
     - `delivery_number = 1`
     - `status = 'scheduled'` (not fulfilled yet)
     - `custom_items = customItems` (JSONB, not stringified)

5. **Customer Substitution Preferences** (lines ~640-660)
   - Creates normalized rows in `customer_substitution_preferences`
   - Each row: `(customer_subscription_id, subscription_box_item_id, chosen_product_id, chosen_quantity, delivery_number=1)`

6. **Helper Functions** (lines ~675-750)
   - `buildChoicesFromRequest()`: Maps customer's group selections to choices
   - `buildPreferencesFromRequest()`: Builds normalized preference rows

**Why this approach:**
- `custom_items` stores immutable snapshot (what customer ordered)
- `customer_substitution_preferences` stores normalized choices (queryable by POS)
- Both stored independently → POS can load customer intent without deserializing JSON
- Delivery #1 with `status='scheduled'` → POS knows it's pending fulfillment

---

### **PHASE 3-5: POS Integration** (Guide Created)

**Files:**
- `Huckster-UI/src/screens/STOREFRONT_SUBSCRIPTION_INTEGRATION.md` (implementation guide)

**What needs to be done:**

1. **OrdersListScreen.tsx**: Filter for storefront subscriptions
   ```typescript
   const storefrontSubscriptionOrders = await db.orders
     .filter(o => o.is_subscription_order === true && o.source === 'storefront')
     .toArray()
   ```

2. **OrderDetailsScreenComponent.tsx**: Load delivery + show fulfill button
   ```typescript
   const delivery = await db.subscriptionDeliveries
     .filter(d => d.order_id === order.id && d.delivery_number === 1 && d.status === 'scheduled')
     .first()
   ```

3. **SubscriptionBoxPackageSelectionModal.tsx**: Accept customer preferences
   ```typescript
   interface Props {
     customerPreferences?: Array<{
       subscription_box_item_id: string
       chosen_product_id: string
       chosen_quantity: number
     }>
   }
   
   // Pre-populate with customer choices, let tenant override
   useEffect(() => {
     if (customerPreferences) {
       const initial = customerPreferences.reduce((acc, pref) => ({
         ...acc, [pref.chosen_product_id]: pref.chosen_quantity
       }), {})
       setSelectedBins(initial)
     }
   }, [customerPreferences])
   ```

4. **On Modal Save**: Update delivery + increment counter
   ```typescript
   await db.subscriptionDeliveries.update(delivery.id, {
     status: 'fulfilled',
     fulfilled_at: Date.now(),
   })
   
   await db.customerSubscriptions.update(subscription.id, {
     deliveries_fulfilled: (subscription.deliveries_fulfilled || 0) + 1,
   })
   ```

---

## Schema: Exact Columns Used

### **public.orders**
```
id: TEXT PK
tenant_id: UUID FK → tenants(id)
customer_email: TEXT NOT NULL
is_subscription_order: BOOLEAN DEFAULT false
source: TEXT DEFAULT 'storefront'
stripe_payment_intent_id: TEXT (idempotency key)
created_at: TIMESTAMPTZ DEFAULT now()
```

### **public.customer_subscriptions**
```
id: UUID PK
tenant_id: UUID FK → tenants(id)
subscription_product_id: UUID FK → subscription_products(id)
customer_email: TEXT NOT NULL
deliveries_fulfilled: INTEGER DEFAULT 0
payment_status: TEXT DEFAULT 'pending'
total_paid_cents: INTEGER
stripe_payment_intent_id: TEXT (for tracking)
created_at: TIMESTAMPTZ
```

### **public.subscription_deliveries**
```
id: UUID PK
tenant_id: UUID FK → tenants(id)
customer_subscription_id: UUID FK → customer_subscriptions(id)
order_id: UUID FK → orders(id)  [CRITICAL: orders, not sales]
delivery_number: INTEGER DEFAULT 1
status: TEXT DEFAULT 'scheduled'  [scheduled|order_created|fulfilled|skipped]
custom_items: JSONB  [object, not stringified]
created_at: TIMESTAMPTZ
```

### **public.customer_substitution_preferences**
```
id: UUID PK
customer_subscription_id: UUID FK → customer_subscriptions(id)
subscription_box_item_id: UUID FK → subscription_box_items(id)
chosen_product_id: TEXT FK → products(id)
chosen_quantity: NUMERIC
delivery_number: INTEGER DEFAULT 1
created_at: TIMESTAMPTZ
```

---

## Key Design Decisions

### ✅ **Idempotency via stripe_payment_intent_id**
- Stable, globally unique ID from Stripe
- Scoped to tenant to prevent collisions
- Check before insert: if exists, return existing order (no duplicates)

### ✅ **No component sale_lines at checkout**
- Storefront `orders.order_lines` = only the paid subscription product line
- Box composition lives in `subscription_deliveries.custom_items` + `customer_substitution_preferences`
- Avoids tax/discount confusion (no zero-price phantom lines)

### ✅ **custom_items as immutable JSONB object**
- Stores snapshot of customer's choices + box template at order time
- Enables audit trail (what did customer order?)
- POS loads customer preferences separately from `customer_substitution_preferences`

### ✅ **deliveries_fulfilled=0 at purchase**
- Subscription is created but NOT marked as fulfilled
- `subscription_deliveries` with `status='scheduled'`
- Incremented only when POS actually fulfills (marks status='fulfilled')

### ✅ **subscription_deliveries.order_id = orders.id**
- UUID to UUID FK (proper database integrity)
- NOT sales.id (different system, different type)
- Storefront orders linked directly to deliveries

---

## Testing Checklist

- [ ] **Idempotency**: Submit same Stripe payment intent twice → should return existing order
- [ ] **Subscription creation**: Storefront order creates customer_subscriptions + subscription_deliveries
- [ ] **Custom items storage**: subscription_deliveries.custom_items contains JSONB object
- [ ] **Preferences creation**: customer_substitution_preferences rows created for each customer choice
- [ ] **POS visibility**: OrdersListScreen shows storefront subscription orders
- [ ] **Fulfillment**: Tenant clicks "Fulfill" → modal pre-populates with customer choices
- [ ] **Status update**: On fulfill, subscription_deliveries.status='fulfilled' + deliveries_fulfilled incremented

---

## Files Modified

| File | Changes | Status |
|------|---------|--------|
| `purveyos-storefront/supabase/migrations/20260109_add_storefront_subscription_integration.sql` | Created migration | ✅ |
| `purveyos-storefront/supabase/functions/create-storefront-order/index.ts` | Added idempotency, subscription_deliveries, preferences creation | ✅ |
| `Huckster-UI/src/screens/STOREFRONT_SUBSCRIPTION_INTEGRATION.md` | Created implementation guide | ✅ |

---

## Next Steps

1. **Run migration** on Supabase (adds columns + indexes)
2. **Deploy edge function** changes to purveyos-storefront
3. **Implement POS screens** in Huckster-UI (Phases 3-5)
4. **Test end-to-end**: Customer order → POS fulfillment → delivery marked complete
5. **Sync to IndexedDB**: Ensure Huckster-UI syncs subscription_deliveries + preferences

---

## Questions / Clarifications

**Q: Why storefront uses `orders` instead of `sales`?**
A: `orders` = pending/customer-facing. `sales` = completed/POS-only. Storefront orders are pending until customer picks them up or they're delivered.

**Q: Why not set `subscription_deliveries.order_id` = `sales.id`?**
A: Sales table is POS-only. Storefront creates `orders` records. UUID FK from deliveries → orders (not sales) keeps systems cleanly separated.

**Q: Why store custom_items as JSONB instead of creating component sale_lines?**
A: Component lines confuse receipts, taxes, discounts. JSONB snapshot is immutable audit trail without affecting order totals.

**Q: Why deliveries_fulfilled=0 at purchase, not 1?**
A: Nothing is fulfilled yet. Customer ordered online; POS hasn't picked/shipped. Increment when actual fulfillment happens (status='fulfilled').

---
