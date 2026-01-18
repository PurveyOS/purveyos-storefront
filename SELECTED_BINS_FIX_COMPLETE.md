# Storefront Selected Bins Fix - COMPLETED

## Problem
RPC was failing with: "LB product requires selected_bins but none provided"
- Storefront customers select specific bin packages during checkout
- This bin selection data wasn't being captured and stored in order_lines
- Huckster-UI couldn't fulfill the order because it had no selected_bins data

## Root Cause
Data flow gap: Bin selection happened in UI but wasn't stored in the database:
1. ❌ WeightBinSelector captured bins but only passed weight (binWeight)
2. ❌ create-storefront-order Edge Function didn't build package_key or store selected_bins
3. ❌ order_lines table had no column to store selected_bins
4. ❌ Huckster-UI completeOrder couldn't pass bins to RPC

## Solution Implemented

### 1. Edge Function Updated
**File**: `purveyos-storefront/supabase/functions/create-storefront-order/index.ts`

Added code to:
- Build `package_key` from product ID and weight using buildPackageKey()
- Store as JSON in order_lines: `selected_bins: [{ package_key: "productId|weight", qty: line.qty }]`

```typescript
// Build package_key for bin-based items (LB products)
const product = productsById.get(line.productId)
const packageKey = buildPackageKey(line.productId, product?.unit, line)

// Store selected_bins as JSON array
selected_bins: line.binWeight ? JSON.stringify([{ package_key: packageKey, qty: line.qty }]) : null
```

### 2. Database Migration Created
**File**: `purveyos-storefront/supabase/migrations/add_selected_bins_to_order_lines.sql`

Adds the missing column:
```sql
ALTER TABLE public.order_lines
ADD COLUMN IF NOT EXISTS selected_bins jsonb DEFAULT NULL;
```

### 3. Data Flow Verified
✅ **Huckster-UI Sync** (sync.ts:1920):
- Already selects ALL columns from order_lines: `.select('*')`
- Will automatically include selected_bins

✅ **completeOrder** (orders.ts:1669):
- Already extracts selectedBins with fallback to selected_bins
- Passes to finalizeCartAsPaidV2

✅ **finalizeCartAsPaidV2** (sales-v2.ts:234):
- Already spreads selected_bins into RPC payload
- Will be sent to finalize_sale_v2 RPC

## Data Flow (Now Complete)
```
1. WeightBinSelector (storefront)
   ↓ passes { weightBtn, unitPriceCents }
2. onAddBinToCart
   ↓ stores in cart as { binWeight, unitPriceCents }
3. create-storefront-order Edge Function
   ↓ builds package_key = "productId|weight"
   ↓ stores in order_lines.selected_bins = [{ package_key, qty }]
4. Huckster-UI Sync
   ↓ pulls order_lines with selected_bins column
5. completeOrder
   ↓ extracts selectedBins from order line
   ↓ passes to finalizeCartAsPaidV2
6. finalizeCartAsPaidV2
   ↓ spreads selected_bins into RPC call
7. finalize_sale_v2 RPC
   ↓ uses selected_bins to fulfill inventory ✓
```

## Deployment Steps
1. Deploy migration to storefront database:
   ```bash
   npx supabase migrations up
   ```

2. Deploy updated Edge Function:
   ```bash
   supabase functions deploy create-storefront-order
   ```

3. No Huckster-UI code changes needed - already has the support!

## Testing
1. Create storefront order with LB product that requires bin selection
2. Customer selects a bin size in the selector
3. Order syncs to Huckster-UI
4. completteOrder() is called from OrderDetailsScreen
5. RPC should execute successfully with no "selected_bins required" error ✓

## Files Modified
- ✅ `purveyos-storefront/supabase/functions/create-storefront-order/index.ts` (Lines 335-360)
- ✅ `purveyos-storefront/supabase/migrations/add_selected_bins_to_order_lines.sql` (Created)

## Files Not Modified (Already Support This)
- Huckster-UI/src/services/sync.ts - Already selects all columns
- Huckster-UI/src/services/orders.ts - Already extracts selectedBins
- Huckster-UI/src/services/sales-v2.ts - Already spreads selected_bins to RPC
