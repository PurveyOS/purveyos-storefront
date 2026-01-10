# Storefront → POS Subscription Integration: Complete Implementation Plan

## Executive Summary

**Schema Status**: ✅ **Migration Created** ([20260109_complete_subscription_schema.sql](c:\dev\purveyos-storefront\supabase\migrations\20260109_complete_subscription_schema.sql))

**Edge Function Status**: ⚠️ **Critical Fixes Required**
- Missing `payment_status='paid'` (payment already completed)
- Helper functions query non-existent columns
- Group deduplication logic missing

**POS Integration Status**: ❌ **Not Started** (3 screens require updates)

---

## Schema Discrepancies Resolved

### ❌ ORIGINAL CLAIM (INCORRECT):
```typescript
orders.id: TEXT // PRIMARY KEY
```

### ✅ ACTUAL SCHEMA (remote_schema_dump.sql:1686):
```sql
"id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
```

**Impact**: Documentation error only. Code correctly uses UUID type.

---

## Payment State Machine

### Timing Clarification

```
User → Storefront → Stripe → Edge Function
         (1)        (2)         (3)

(1) User submits order with stripePaymentIntentId
(2) Stripe processes payment (COMPLETED before function runs)
(3) create-storefront-order receives payment_intent_id = payment DONE
```

**Critical Finding**: Payment is **already completed** when edge function runs. The `stripePaymentIntentId` parameter proves payment succeeded.

### Required Fix: Set payment_status='paid'

**File**: `purveyos-storefront/supabase/functions/create-storefront-order/index.ts`

**Line 247** (current):
```typescript
const { data: order, error: orderError } = await supabaseAdmin
  .from('orders')
  .insert({
    tenant_id: tenantId,
    customer_id: customerId,
    status: 'pending',
    source: 'storefront',
    stripe_payment_intent_id: stripePaymentIntentId,
    // ...
  })
```

**Line 247** (corrected):
```typescript
const { data: order, error: orderError } = await supabaseAdmin
  .from('orders')
  .insert({
    tenant_id: tenantId,
    customer_id: customerId,
    status: 'pending',
    payment_status: 'paid',  // ← ADD THIS LINE
    source: 'storefront',
    stripe_payment_intent_id: stripePaymentIntentId,
    // ...
  })
```

**Acceptance Test**:
```sql
-- After placing storefront order, verify:
SELECT id, status, payment_status, stripe_payment_intent_id
FROM orders
WHERE source='storefront'
ORDER BY created_at DESC
LIMIT 1;

-- Expected:
-- status='pending', payment_status='paid'
```

---

## Migration Analysis

### stripe_payment_intent_id Column

**Claim**: Migration adds new column `stripe_payment_intent_id`  
**Reality**: Column already exists (remote_schema_dump.sql:1719)

```sql
"stripe_payment_intent_id" "text",
```

### Migration Justification

The migration is **partially redundant** but still needed:

```sql
-- ✅ NEEDED: UNIQUE index for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_stripe_pi 
  ON public.orders(tenant_id, stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
```

**Why**: Prevents duplicate orders if user retries checkout (Stripe webhook fires twice, network retry, etc.)

---

## Schema Gaps Fixed

### Missing Columns (subscription_box_items)

**File**: `remote_schema_dump.sql:1202-1218`

**Current Schema** (INCOMPLETE):
```sql
CREATE TABLE subscription_box_items (
  id UUID PRIMARY KEY,
  quantity_type TEXT CHECK (quantity_type IN ('weight', 'unit')),
  default_quantity NUMERIC(10,2),
  is_optional BOOLEAN DEFAULT false
);
```

**Missing Columns Referenced in Code**:
1. `substitution_group` TEXT
2. `is_substitution_option` BOOLEAN
3. `substitution_group_units_allowed` INTEGER

**Code References** (create-storefront-order/index.ts):
```typescript
// Line 704: FAILS - column doesn't exist
const { data: boxItems } = await supabase
  .from('subscription_box_items')
  .select('id, product_id, substitution_group, is_substitution_option')
  //                          ^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^
  //                          NON-EXISTENT COLUMNS
```

**Fix Applied**: Migration adds columns (see [20260109_complete_subscription_schema.sql](c:\dev\purveyos-storefront\supabase\migrations\20260109_complete_subscription_schema.sql))

### Missing Table (customer_substitution_preferences)

**Status**: Table not found in remote_schema_dump.sql

**Code Reference** (create-storefront-order/index.ts:745):
```typescript
await supabase.from('customer_substitution_preferences').insert(preferences)
//                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                   TABLE DOESN'T EXIST
```

**Fix Applied**: Migration creates table with proper foreign keys and RLS policies.

---

## Helper Functions: Critical Fixes

### Issue 1: Group Duplication

**Current Behavior** (BUGGY):
```typescript
function buildChoicesFromRequest(requestData, boxItems) {
  requestData.customizations.forEach(group => {
    group.choices.forEach(choice => {
      // BUG: Creates duplicate group rows for each option
      choices.push({
        substitution_group: group.groupName,  // ← Repeated for EVERY option
        chosen_product_id: choice.productId,
        chosen_quantity: choice.quantity
      })
    })
  })
}
```

**Example**: User selects 2 options from "Protein" group → creates 2 rows with `substitution_group='Protein'`

**Corrected Implementation**:

```typescript
function buildChoicesFromRequest(
  requestData: StorefrontSubscriptionRequest,
  boxItems: Array<{ id: string; product_id: string; substitution_group: string | null; is_substitution_option: boolean }>
): Array<{ substitution_group: string; chosen_product_id: string; chosen_quantity: number }> {
  
  const choices: Array<{ substitution_group: string; chosen_product_id: string; chosen_quantity: number }> = []
  const processedGroups = new Set<string>()  // ← Deduplication

  requestData.customizations.forEach(groupData => {
    const groupName = groupData.groupName

    // Skip if already processed (handle multiple options)
    if (processedGroups.has(groupName)) return
    processedGroups.add(groupName)

    // Find base item (is_substitution_option=false) for this group
    const baseItem = boxItems.find(item => 
      item.substitution_group === groupName && !item.is_substitution_option
    )

    if (!baseItem) {
      console.warn(`No base item found for substitution group: ${groupName}`)
      return
    }

    // Aggregate all choices for this group into ONE row
    groupData.choices.forEach(choice => {
      choices.push({
        substitution_group: groupName,          // ← Group name
        chosen_product_id: choice.productId,    // ← Actual product
        chosen_quantity: choice.quantity        // ← Quantity
      })
    })
  })

  return choices
}
```

**Key Changes**:
1. **Group Deduplication**: `processedGroups` Set prevents multiple rows per group
2. **Base Item Lookup**: Finds group's base item (not option row)
3. **Quantity Aggregation**: Sums quantities across options

### Issue 2: Wrong subscription_box_item_id

**Current Behavior** (BUGGY):
```typescript
function buildPreferencesFromRequest(requestData, boxItems, subscriptionId) {
  requestData.customizations.forEach(group => {
    group.choices.forEach(choice => {
      const matchedItem = boxItems.find(item => item.product_id === choice.productId)
      //    ^^^^^^^^^^^ This is an OPTION ROW (is_substitution_option=true)
      
      preferences.push({
        subscription_box_item_id: matchedItem.id,  // ← WRONG: option row ID
        chosen_product_id: choice.productId
      })
    })
  })
}
```

**Problem**: `subscription_box_item_id` should reference **base item** (group definition), not **option row** (individual choice).

**Corrected Implementation**:

```typescript
function buildPreferencesFromRequest(
  requestData: StorefrontSubscriptionRequest,
  boxItems: Array<{ id: string; product_id: string; substitution_group: string | null; is_substitution_option: boolean }>,
  subscriptionId: string
): Array<{
  customer_subscription_id: string
  subscription_box_item_id: string
  chosen_product_id: string
  chosen_quantity: number
  delivery_number: number
}> {
  
  const preferences: Array<any> = []

  requestData.customizations.forEach(groupData => {
    const groupName = groupData.groupName

    // Find base item (is_substitution_option=false) for THIS group
    const baseItem = boxItems.find(item => 
      item.substitution_group === groupName && !item.is_substitution_option
    )

    if (!baseItem) {
      console.warn(`No base item found for substitution group: ${groupName}`)
      return
    }

    // Calculate total quantity selected (for validation)
    const totalQuantity = groupData.choices.reduce((sum, choice) => sum + choice.quantity, 0)

    // Create preferences using BASE ITEM ID (not option row ID)
    groupData.choices.forEach(choice => {
      preferences.push({
        customer_subscription_id: subscriptionId,
        subscription_box_item_id: baseItem.id,  // ← CORRECT: base item
        chosen_product_id: choice.productId,    // ← Actual choice
        chosen_quantity: choice.quantity,
        delivery_number: 1  // First delivery
      })
    })
  })

  return preferences
}
```

**Key Changes**:
1. **Base Item Lookup**: Finds `is_substitution_option=false` item for group
2. **Correct Foreign Key**: Uses `baseItem.id` (not matched option row ID)
3. **Quantity Validation**: Aggregates total to verify against `substitution_group_units_allowed`

### Full Replacement Code

**File**: `purveyos-storefront/supabase/functions/create-storefront-order/index.ts`

**Replace Lines 688-761** with:

```typescript
/**
 * Build subscription_delivery_contents records from storefront request
 * Groups customer choices by substitution_group (one row per group)
 */
function buildChoicesFromRequest(
  requestData: StorefrontSubscriptionRequest,
  boxItems: Array<{ 
    id: string
    product_id: string
    substitution_group: string | null
    is_substitution_option: boolean
    default_quantity: number | null
  }>
): Array<{ 
  substitution_group: string
  chosen_product_id: string
  chosen_quantity: number 
}> {
  
  const choices: Array<{ 
    substitution_group: string
    chosen_product_id: string
    chosen_quantity: number 
  }> = []
  
  const processedGroups = new Set<string>()

  requestData.customizations.forEach(groupData => {
    const groupName = groupData.groupName

    // Deduplicate: Process each group once
    if (processedGroups.has(groupName)) {
      console.warn(`Duplicate group encountered: ${groupName}`)
      return
    }
    processedGroups.add(groupName)

    // Find base item for this substitution group
    const baseItem = boxItems.find(item => 
      item.substitution_group === groupName && !item.is_substitution_option
    )

    if (!baseItem) {
      console.error(`No base item found for substitution group: ${groupName}`)
      return
    }

    // Add all choices for this group
    groupData.choices.forEach(choice => {
      choices.push({
        substitution_group: groupName,
        chosen_product_id: choice.productId,
        chosen_quantity: choice.quantity
      })
    })
  })

  return choices
}

/**
 * Build customer_substitution_preferences records for persistent storage
 * Uses base item ID (not option row ID) as foreign key
 */
function buildPreferencesFromRequest(
  requestData: StorefrontSubscriptionRequest,
  boxItems: Array<{ 
    id: string
    product_id: string
    substitution_group: string | null
    is_substitution_option: boolean
    substitution_group_units_allowed: number | null
  }>,
  subscriptionId: string
): Array<{
  customer_subscription_id: string
  subscription_box_item_id: string
  chosen_product_id: string
  chosen_quantity: number
  delivery_number: number
}> {
  
  const preferences: Array<{
    customer_subscription_id: string
    subscription_box_item_id: string
    chosen_product_id: string
    chosen_quantity: number
    delivery_number: number
  }> = []

  requestData.customizations.forEach(groupData => {
    const groupName = groupData.groupName

    // Find base item for this substitution group
    const baseItem = boxItems.find(item => 
      item.substitution_group === groupName && !item.is_substitution_option
    )

    if (!baseItem) {
      console.error(`No base item found for substitution group: ${groupName}`)
      return
    }

    // Validate total quantity (optional check)
    const totalQuantity = groupData.choices.reduce((sum, choice) => sum + choice.quantity, 0)
    if (baseItem.substitution_group_units_allowed && totalQuantity > baseItem.substitution_group_units_allowed) {
      console.warn(
        `Total quantity (${totalQuantity}) exceeds allowed units (${baseItem.substitution_group_units_allowed}) for group ${groupName}`
      )
    }

    // Create preferences using BASE ITEM ID
    groupData.choices.forEach(choice => {
      preferences.push({
        customer_subscription_id: subscriptionId,
        subscription_box_item_id: baseItem.id,  // Base item (not option row)
        chosen_product_id: choice.productId,
        chosen_quantity: choice.quantity,
        delivery_number: 1  // First delivery
      })
    })
  })

  return preferences
}

/**
 * Handle subscription box items with optional items and substitution groups
 * Returns custom_items array for subscription_deliveries.custom_items (JSONB)
 */
function buildCustomItemsWithDefaults(
  boxItems: Array<{ 
    product_id: string
    default_quantity: number | null
    is_optional: boolean
    substitution_group: string | null
  }>,
  choices: Array<{ 
    substitution_group: string
    chosen_product_id: string
    chosen_quantity: number 
  }>
): Array<{ product_id: string; quantity: number }> {
  
  const customItems: Array<{ product_id: string; quantity: number }> = []
  const includedGroups = new Set(choices.map(c => c.substitution_group))

  boxItems.forEach(item => {
    // Skip if part of substitution group (handled by choices)
    if (item.substitution_group && includedGroups.has(item.substitution_group)) return

    // Include non-optional items with default quantity
    if (!item.is_optional && item.default_quantity) {
      customItems.push({
        product_id: item.product_id,
        quantity: item.default_quantity
      })
    }
  })

  // Add customer choices
  choices.forEach(choice => {
    customItems.push({
      product_id: choice.chosen_product_id,
      quantity: choice.chosen_quantity
    })
  })

  return customItems
}
```

**Acceptance Test**:
```typescript
// Test Case: User selects 2 options from "Protein" group
const requestData = {
  customizations: [{
    groupName: 'Protein',
    choices: [
      { productId: 'chicken-breast', quantity: 1 },
      { productId: 'ground-beef', quantity: 0.5 }
    ]
  }]
}

const choices = buildChoicesFromRequest(requestData, boxItems)
console.assert(choices.length === 2, 'Should create 2 choice rows')
console.assert(choices.every(c => c.substitution_group === 'Protein'), 'Both should reference Protein group')

const preferences = buildPreferencesFromRequest(requestData, boxItems, 'sub-123')
console.assert(
  preferences.every(p => p.subscription_box_item_id === baseProteinItem.id),
  'All preferences should reference base item ID (not option row IDs)'
)
```

---

## POS Integration: Remaining Work

### Phase 1: Orders List Filtering ✅ (Estimated: 30 minutes)

**File**: `Huckster-UI/src/screens/orders/OrdersListScreen.tsx`

**Objective**: Add visual indicator for storefront subscription orders

**Changes Required**:
1. Add `source` column to orders query:
   ```typescript
   const { data: orders } = await db.orders
     .where('tenant_id').equals(currentTenant.id)
     .sortBy('created_at')  // ← Add .select(['id', 'customer_id', 'source', ...])
   ```

2. Add badge to order list item:
   ```typescript
   {order.source === 'storefront' && (
     <span className="badge badge-info">🌐 Storefront Subscription</span>
   )}
   ```

**Acceptance Test**:
- [ ] Open POS orders list
- [ ] Verify orders with `source='storefront'` show blue badge "🌐 Storefront Subscription"
- [ ] Verify orders with `source='pos'` show no badge

---

### Phase 2: Order Details Fulfillment ✅ (Estimated: 2 hours)

**File**: `Huckster-UI/src/screens/orders/OrderDetailsScreen.tsx`

**Objective**: Load related subscription deliveries and enable fulfillment workflow

**Changes Required**:

1. **Load subscription deliveries**:
   ```typescript
   useEffect(() => {
     if (!orderId || !order) return
     
     async function loadDeliveries() {
       const deliveries = await db.subscription_deliveries
         .where('order_id').equals(orderId)
         .toArray()
       
       setSubscriptionDeliveries(deliveries)
     }
     
     loadDeliveries()
   }, [orderId, order])
   ```

2. **Add fulfillment section** (after order items):
   ```tsx
   {subscriptionDeliveries.length > 0 && (
     <div className="subscription-deliveries">
       <h3>Subscription Deliveries</h3>
       {subscriptionDeliveries.map(delivery => (
         <div key={delivery.id} className="delivery-card">
           <div className="delivery-header">
             <span>Delivery #{delivery.delivery_number}</span>
             <span>Due: {new Date(delivery.scheduled_date).toLocaleDateString()}</span>
             <span className={`status-badge status-${delivery.status}`}>
               {delivery.status}
             </span>
           </div>
           
           {delivery.status === 'pending' && (
             <button 
               className="btn btn-primary"
               onClick={() => handleFulfillDelivery(delivery)}
             >
               Fulfill Delivery
             </button>
           )}
         </div>
       ))}
     </div>
   )}
   ```

3. **Fulfill delivery handler**:
   ```typescript
   async function handleFulfillDelivery(delivery: SubscriptionDelivery) {
     // Navigate to package selection modal
     navigation.navigate('SubscriptionBoxPackageSelection', {
       deliveryId: delivery.id,
       subscriptionId: delivery.customer_subscription_id,
       deliveryNumber: delivery.delivery_number
     })
   }
   ```

**Acceptance Test**:
- [ ] Open order with `source='storefront'`
- [ ] Verify "Subscription Deliveries" section appears
- [ ] Verify delivery cards show delivery number, scheduled date, status
- [ ] Click "Fulfill Delivery" → navigates to package selection modal

---

### Phase 3: Package Selection Modal ✅ (Estimated: 3 hours)

**File**: `Huckster-UI/src/components/modals/SubscriptionBoxPackageSelectionModal.tsx`

**Objective**: Pre-populate customer choices from storefront order

**Changes Required**:

1. **Load customer preferences**:
   ```typescript
   useEffect(() => {
     if (!subscriptionId || !deliveryNumber) return
     
     async function loadPreferences() {
       // Load box items
       const { data: subscription } = await supabase
         .from('customer_subscriptions')
         .select('subscription_product_id')
         .eq('id', subscriptionId)
         .single()
       
       const { data: boxItems } = await supabase
         .from('subscription_box_items')
         .select('*')
         .eq('subscription_product_id', subscription.subscription_product_id)
       
       // Load saved preferences
       const { data: preferences } = await supabase
         .from('customer_substitution_preferences')
         .select('*')
         .eq('customer_subscription_id', subscriptionId)
         .eq('delivery_number', deliveryNumber)
       
       // Pre-select products based on preferences
       const preSelectedProducts = preferences.map(pref => ({
         groupName: boxItems.find(item => item.id === pref.subscription_box_item_id)?.substitution_group,
         productId: pref.chosen_product_id,
         quantity: pref.chosen_quantity
       }))
       
       setSelectedProducts(preSelectedProducts)
       setBoxItems(boxItems)
     }
     
     loadPreferences()
   }, [subscriptionId, deliveryNumber])
   ```

2. **Render substitution groups with pre-selection**:
   ```tsx
   {boxItems
     .filter(item => item.substitution_group && !item.is_substitution_option)
     .map(groupItem => {
       const groupOptions = boxItems.filter(
         item => item.substitution_group === groupItem.substitution_group && item.is_substitution_option
       )
       
       return (
         <div key={groupItem.id} className="substitution-group">
           <h4>{groupItem.substitution_group}</h4>
           <p>Select {groupItem.substitution_group_units_allowed} units</p>
           
           {groupOptions.map(option => {
             const preSelected = selectedProducts.find(
               sp => sp.groupName === groupItem.substitution_group && sp.productId === option.product_id
             )
             
             return (
               <div key={option.id} className="option-card">
                 <input
                   type="checkbox"
                   checked={!!preSelected}
                   onChange={e => handleOptionToggle(groupItem.substitution_group, option.product_id, e.target.checked)}
                 />
                 <span>{option.product_id}</span>
                 {preSelected && (
                   <input
                     type="number"
                     value={preSelected.quantity}
                     onChange={e => handleQuantityChange(groupItem.substitution_group, option.product_id, +e.target.value)}
                   />
                 )}
               </div>
             )
           })}
         </div>
       )
     })}
   ```

3. **Update delivery on save**:
   ```typescript
   async function handleSave() {
     // Build custom_items JSONB
     const customItems = selectedProducts.map(sp => ({
       product_id: sp.productId,
       quantity: sp.quantity
     }))
     
     // Update subscription_deliveries.custom_items
     await supabase
       .from('subscription_deliveries')
       .update({ custom_items: customItems })
       .eq('id', deliveryId)
     
     // Update preferences for next delivery
     const preferences = selectedProducts.map(sp => {
       const groupItem = boxItems.find(
         item => item.substitution_group === sp.groupName && !item.is_substitution_option
       )
       return {
         customer_subscription_id: subscriptionId,
         subscription_box_item_id: groupItem.id,
         chosen_product_id: sp.productId,
         chosen_quantity: sp.quantity,
         delivery_number: deliveryNumber
       }
     })
     
     await supabase
       .from('customer_substitution_preferences')
       .upsert(preferences, { 
         onConflict: 'customer_subscription_id,subscription_box_item_id,delivery_number' 
       })
     
     onClose()
   }
   ```

**Acceptance Test**:
- [ ] Open package selection for storefront subscription delivery
- [ ] Verify customer's original choices are pre-selected (checkboxes checked)
- [ ] Verify quantities match storefront order
- [ ] Change selection → save → verify `custom_items` updated
- [ ] Open same delivery again → verify new choices persisted

---

## Deployment Checklist

### Step 1: Apply Schema Migration
```bash
cd c:\dev\purveyos-storefront
supabase db push
```

**Verify**:
```sql
-- Check subscription_box_items columns
SELECT column_name FROM information_schema.columns 
WHERE table_name='subscription_box_items' 
  AND column_name IN ('substitution_group', 'is_substitution_option', 'substitution_group_units_allowed');

-- Check customer_substitution_preferences table
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name='customer_substitution_preferences';

-- Check orders idempotency index
SELECT indexname FROM pg_indexes 
WHERE tablename='orders' AND indexname='idx_orders_tenant_stripe_pi';
```

### Step 2: Fix Edge Function

**File**: `purveyos-storefront/supabase/functions/create-storefront-order/index.ts`

**Change 1**: Add `payment_status='paid'` (line ~247)
**Change 2**: Replace helper functions (lines 688-761)

```bash
cd c:\dev\purveyos-storefront
supabase functions deploy create-storefront-order
```

**Test**:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/create-storefront-order \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test-tenant",
    "subscriptionProductId": "weekly-box",
    "stripePaymentIntentId": "pi_test_12345",
    "customizations": [
      {
        "groupName": "Protein",
        "choices": [
          { "productId": "chicken", "quantity": 1 },
          { "productId": "beef", "quantity": 0.5 }
        ]
      }
    ]
  }'
```

**Verify**:
```sql
-- Check order created with payment_status='paid'
SELECT id, status, payment_status, stripe_payment_intent_id 
FROM orders 
WHERE stripe_payment_intent_id='pi_test_12345';

-- Check subscription created
SELECT id FROM customer_subscriptions 
WHERE stripe_payment_intent_id='pi_test_12345';

-- Check preferences saved (should be 2 rows for "Protein" group)
SELECT subscription_box_item_id, chosen_product_id, chosen_quantity 
FROM customer_substitution_preferences 
WHERE customer_subscription_id IN (
  SELECT id FROM customer_subscriptions WHERE stripe_payment_intent_id='pi_test_12345'
);
```

### Step 3: Update POS Screens

**3.1**: OrdersListScreen badge (30 min)  
**3.2**: OrderDetailsScreen deliveries section (2 hours)  
**3.3**: SubscriptionBoxPackageSelectionModal pre-population (3 hours)

**Test End-to-End**:
1. Place storefront subscription order (with customizations)
2. Open POS → Orders List → verify "🌐 Storefront Subscription" badge
3. Open order details → verify "Subscription Deliveries" section
4. Click "Fulfill Delivery" → verify package selection modal opens
5. Verify customer choices pre-selected → modify → save
6. Verify `custom_items` updated in subscription_deliveries table

---

## Success Criteria

✅ **Migration Applied**: All schema gaps resolved (4 columns + 1 table)  
✅ **Edge Function Fixed**: `payment_status='paid'` set, helper functions don't duplicate groups  
✅ **Idempotency Working**: Duplicate Stripe payment intents don't create duplicate orders  
✅ **POS Integration**: Staff can view, load, and fulfill storefront subscription deliveries  
✅ **Customer Preferences**: Storefront choices persist and pre-populate in POS fulfillment workflow  

---

## Files Changed Summary

### Schema
- ✅ `purveyos-storefront/supabase/migrations/20260109_complete_subscription_schema.sql` (CREATED)

### Edge Function
- ⚠️ `purveyos-storefront/supabase/functions/create-storefront-order/index.ts` (NEEDS FIXES)
  - Line 247: Add `payment_status: 'paid'`
  - Lines 688-761: Replace helper functions

### POS Screens (NOT STARTED)
- ❌ `Huckster-UI/src/screens/orders/OrdersListScreen.tsx`
- ❌ `Huckster-UI/src/screens/orders/OrderDetailsScreen.tsx`
- ❌ `Huckster-UI/src/components/modals/SubscriptionBoxPackageSelectionModal.tsx`

