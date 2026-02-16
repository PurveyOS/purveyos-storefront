# Option A Bulk Weight Bin Support - Smoke Test Checklist

**Objective**: Verify that all 8 phases of bulk weight bin support are working correctly.

**Scope**: Storefront (reserve-only) + Huckster-UI (decrement-only) + schema migrations + RPCs

---

## Phase 1: Database Schema ✓

### Migration Verification

**File**: `Huckster-UI/supabase/migrations/20260214_add_bulk_weight_bin_option_a.sql`
**File**: `purveyos-storefront/supabase/migrations/20260214_add_bulk_weight_bin_support.sql`

- [ ] **bin_kind column exists**
  - [ ] Data type: `TEXT NULL`
  - [ ] Check constraint: `bin_kind IN (NULL, 'bulk_weight')`
  - [ ] No backfill (legacy bins remain NULL)

- [ ] **qty_lbs column exists**
  - [ ] Data type: `NUMERIC NULL`
  - [ ] Only populated for bulk bins (bin_kind='bulk_weight')

- [ ] **reserved_lbs column exists**
  - [ ] Data type: `NUMERIC NOT NULL DEFAULT 0`
  - [ ] Initialized to 0 for all bins

- [ ] **Unique index for bulk bins**
  - [ ] Index: `(tenant_id, product_id) WHERE bin_kind='bulk_weight'`
  - [ ] Ensures one bulk bin per product per tenant

- [ ] **CHECK constraint added** ✓
  - [ ] Constraint: `reserved_lbs <= qty_lbs OR bin_kind IS NULL`
  - [ ] Prevents oversell of bulk bins at DB level

### SQL Validation Command:
```sql
-- Test in Supabase SQL Editor
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'package_bins'
  AND column_name IN ('bin_kind', 'qty_lbs', 'reserved_lbs');

-- Should return 3 rows:
-- bin_kind | text | YES
-- qty_lbs | numeric | YES
-- reserved_lbs | numeric | NO
```

---

## Phase 2: RPC Functions ✓

### File Verification

**File**: `Huckster-UI/supabase/migrations/20260214_phase3_bulk_bin_helpers.sql`

#### RPC 1: `ensure_bulk_bin_exists(product_id, tenant_id, unit_price_cents)`

- [ ] **Function signature correct**
  - [ ] Parameters: `p_product_id UUID, p_tenant_id UUID, p_unit_price_cents INT`
  - [ ] Returns: `RECORD` with `success BOOLEAN, package_key TEXT`

- [ ] **Idempotent behavior**
  - [ ] If bulk bin exists, returns it (no duplicate creation)
  - [ ] If no bulk bin, creates one with:
    - [ ] package_key = `{productId}|bulk`
    - [ ] bin_kind = 'bulk_weight'
    - [ ] qty_lbs = NULL (empty until inventory received)
    - [ ] reserved_lbs = 0

- [ ] **Test in Supabase SQL Editor**:
  ```sql
  -- First call - should CREATE
  SELECT * FROM ensure_bulk_bin_exists('product-1'::uuid, 'tenant-1'::uuid, 10000);
  
  -- Second call - should return SAME packageKey (idempotent)
  SELECT * FROM ensure_bulk_bin_exists('product-1'::uuid, 'tenant-1'::uuid, 10000);
  
  -- Verify in package_bins
  SELECT package_key, bin_kind, qty_lbs, reserved_lbs
  FROM package_bins
  WHERE product_id = 'product-1'::uuid AND bin_kind = 'bulk_weight';
  ```

---

### File Verification

**File**: `Huckster-UI/supabase/migrations/20260214_phase4_reservation_rpcs.sql`

#### RPC 2: `reserve_selected_bins(p_tenant_id, p_selected_bins, p_order_id, p_expiration_minutes)`

- [ ] **Legacy branch (bin_kind=NULL)**
  - [ ] Extracts weightBtn and packs from selected_bins
  - [ ] Increments `reserved_qty += packs`
  - [ ] Updates `updated_at`
  - [ ] Uses FOR UPDATE lock for concurrency

- [ ] **Bulk branch (bin_kind='bulk_weight')**
  - [ ] Extracts requested_lbs from selected_bins
  - [ ] Validates: `qty_lbs - reserved_lbs >= requested_lbs`
  - [ ] Increments `reserved_lbs += requested_lbs`
  - [ ] Throws error if insufficient: `RAISE EXCEPTION 'Insufficient bulk weight...'`

- [ ] **Test in Supabase**:
  ```sql
  -- Setup: create bulk bin with 10 lbs on hand
  INSERT INTO package_bins (tenant_id, product_id, package_key, bin_kind, qty_lbs, reserved_lbs, ...)
  VALUES ('tenant-1'::uuid, 'product-1'::uuid, 'product-1|bulk', 'bulk_weight', 10.0, 0, ...);
  
  -- Reserve 2.5 lbs
  SELECT reserve_selected_bins(
    'tenant-1'::uuid,
    jsonb_build_array(jsonb_build_object('package_key', 'product-1|bulk', 'bins_requested', 2.5, 'bin_kind', 'bulk_weight')),
    'order-1'::uuid,
    30
  );
  
  -- Verify reserved_lbs is now 2.5
  SELECT reserved_lbs FROM package_bins WHERE product_id = 'product-1'::uuid AND bin_kind = 'bulk_weight';
  ```

#### RPC 3: `reserve_product_inventory(p_tenant_id, p_order_id, p_order_line_id, p_product_id, p_requested_weight_lbs)`

- [ ] **For pack-for-you orders**
  - [ ] Checks if product has bulk bin (bin_kind='bulk_weight')

- [ ] **Bulk path**
  - [ ] Reserves `requested_weight_lbs` against `reserved_lbs`
  - [ ] Validates: `qty_lbs - reserved_lbs >= requested_weight_lbs`

- [ ] **Fallback path**
  - [ ] If no bulk bin, inserts into `product_reservations` (legacy)

- [ ] **Test in Supabase**:
  ```sql
  -- Reserve 3 lbs for pack-for-you order
  SELECT reserve_product_inventory(
    'tenant-1'::uuid,
    'order-2'::uuid,
    'order-line-1'::uuid,
    'product-1'::uuid,
    3.0
  );
  ```

---

## Phase 3: RPC Decrement Function ✓

### File Verification

**File**: `Huckster-UI/supabase/migrations/20251216000005_create_fulfill_order_line_rpc.sql`

#### RPC 4: `fulfill_order_line(p_tenant_id, p_selected_bins, ...)`

- [ ] **Detects bin_kind from selected_bins**
  - [ ] Extracts `bin_kind` from `selected_bins[0]`

- [ ] **Legacy branch (bin_kind=NULL)**
  - [ ] Decrements: `qty -= packs`
  - [ ] Decrements: `reserved_qty -= packs`

- [ ] **Bulk branch (bin_kind='bulk_weight')**
  - [ ] Decrements: `qty_lbs -= lbs`
  - [ ] Decrements: `reserved_lbs -= lbs`

- [ ] **Validation**
  - [ ] Checks `qty - reserved_qty >= packs` (legacy) BEFORE decrement
  - [ ] Checks `qty_lbs - reserved_lbs >= lbs` (bulk) BEFORE decrement
  - [ ] Raises error if insufficient

- [ ] **Test fulfilling bulk order**:
  ```sql
  -- Reverse: decrement 2.5 lbs from reserved and available
  SELECT fulfill_order_line(
    'tenant-1'::uuid,
    jsonb_build_array(jsonb_build_object('bin_kind', 'bulk_weight', 'lbs', 2.5))
  );
  
  -- Verify qty_lbs and reserved_lbs both decreased
  SELECT qty_lbs, reserved_lbs FROM package_bins 
  WHERE product_id = 'product-1'::uuid AND bin_kind = 'bulk_weight';
  -- Expected: qty_lbs = 7.5, reserved_lbs = 0.5 (if we had reserved 3 before)
  ```

---

## Phase 4: Storefront Edge Function ✓

### File Verification

**File**: `purveyos-storefront/supabase/functions/create-storefront-order/index.ts`

#### Verification Checklist

- [ ] **RESERVE-ONLY enforcement**
  - [ ] No decrement logic (lines that previously did `qty -= ...` removed)
  - [ ] All package_bins update calls are for `reserved_qty` or `reserved_lbs`

- [ ] **For exact_package orders**
  - [ ] Calls `reserve_selected_bins()` RPC
  - [ ] Passes selected_bins with correct structure (includes bin_kind)

- [ ] **For pack-for-you orders**
  - [ ] Calls `reserve_product_inventory()` RPC
  - [ ] Passes `p_requested_weight_lbs` parameter

- [ ] **Metadata storage**
  - [ ] Stores `selected_bins` on `order_lines`
  - [ ] For bulk bins: includes `bin_kind='bulk_weight'` in selected_bins

- [ ] **No Huckster-UI calls**
  - [ ] Does NOT call finalize_sale_v2
  - [ ] Does NOT decrement inventory (only reserves)

- [ ] **Test against staging db**:
  - [ ] Create storefront order with bulk product
  - [ ] Check order_lines.selected_bins includes bulk metadata
  - [ ] Check package_bins shows `reserved_lbs` incremented
  - [ ] Check `qty_lbs` unchanged (no decrement)

---

## Phase 5: Huckster-UI Edge Function ✓

### File Verification

**File**: `Huckster-UI/supabase/functions/create-storefront-order/index.ts`

#### Verification Checklist

- [ ] **For pack-for-you orders with bulk**
  - [ ] Detects bulk bin exists for product
  - [ ] Builds `selectedBinsArr` entry: `{ package_key: '{productId}|bulk', qty: requestedWeightLbs, bin_kind: 'bulk_weight' }`
  - [ ] Stores on `order_line.selected_bins`

- [ ] **Calls reserve_product_inventory()**
  - [ ] Passes `p_requested_weight_lbs` 
  - [ ] RPC accepts and handles bulk

- [ ] **No decrement**
  - [ ] Only reserves lbs
  - [ ] Does NOT call fulfill_order_line (that's finalize's job)

- [ ] **Test against staging db**:
  - [ ] Create Huckster-UI pack-for-you order with bulk product
  - [ ] Check order_line.selected_bins has bin_kind='bulk_weight'
  - [ ] Check package_bins.reserved_lbs incremented

---

## Phase 6: Storefront Order-Mode Override ✓

### File Verification

**File**: `purveyos-storefront/src/components/ProductCard.tsx`

#### Verification Checklist

- [ ] **hasBulkBin detection**
  - [ ] Function checks: `product.weightBins.some(b => b.binKind === 'bulk_weight')`
  - [ ] Returns true only if bin_kind='bulk_weight' exists

- [ ] **effectiveOrderMode override**
  - [ ] If `hasBulkBin`, override to 'pack_for_you'
  - [ ] Ignores `tenantDefaultOrderMode` for bulk products
  - [ ] Legacy products still respect tenant default

- [ ] **UI routing**
  - [ ] Bulk products skip WeightBinSelector (modal not shown)
  - [ ] Bulk products show weight entry input instead
  - [ ] Pack-for-you UI with `{lb}` displayed and `handleAddPackForYou()` called

- [ ] **Manual test**:
  - [ ] Create product with bulk bin (bin_kind='bulk_weight')
  - [ ] Load storefront
  - [ ] Product card displays weight entry (NOT "Choose Package Size")
  - [ ] Weight input accepts decimal values
  - [ ] "Add Estimated Weight" button appears

---

## Phase 7: Data Fetch & Mapping ✓

### File Verification

**File**: `purveyos-storefront/src/hooks/useStorefrontData.ts`

#### Verification Checklist

- [ ] **SELECT includes bulk fields**
  - [ ] Query: `.select('..., bin_kind, qty_lbs, reserved_lbs')`

- [ ] **binsByProduct map includes bulk fields**
  - [ ] Each bin object has: `binKind`, `qtyLbs`, `reservedLbs`

- [ ] **Inventory aggregation branches by bin_kind**
  - [ ] Legacy: `qty - reserved_qty` (discrete packs)
  - [ ] Bulk: `qty_lbs - reserved_lbs` (continuous lbs)

- [ ] **availableBins filter branches by bin_kind**
  - [ ] Legacy: `(qty - reserved_qty) > 0`
  - [ ] Bulk: `(qty_lbs - reserved_lbs) > 0`

- [ ] **Type definitions updated**
  - [ ] Product type includes: `binKind?, qtyLbs?, reservedLbs?`

- [ ] **Manual test**:
  - [ ] Add `console.log(products)` to component
  - [ ] Inspect product.weightBins array
  - [ ] Verify bulk bins have `binKind='bulk_weight'`, `qtyLbs`, `reservedLbs`
  - [ ] Verify legacy bins have `binKind=null`, `qty`, `reservedQty`

---

## Phase 8: POS Support (Optional) ✓

**Status**: Implementation guide provided in `PHASE_8_POS_BULK_SUPPORT.md`

- [ ] Read guide: `Huckster-UI/PHASE_8_POS_BULK_SUPPORT.md`
- [ ] Follow steps to implement (when POS bulk support is needed)
- [ ] Run Phase 8 smoke tests when implemented

---

## End-to-End Flow Tests

### Test 1: Exact Package Order Flow (Legacy Bins)

**Scenario**: Customer orders from WeightBinSelector with legacy bins

1. [ ] **Storefront**
   - [ ] Selects package size from WeightBinSelector
   - [ ] Calls `reserve_selected_bins()` → increments `reserved_qty`
   - [ ] Order stored with `selected_bins` array
   - [ ] Order shows reserved, not decremented

2. [ ] **Huckster-UI Finalize**
   - [ ] Manager opens order in finalize_sale_v2
   - [ ] Calls `fulfill_order_line()` with legacy selected_bins
   - [ ] RPCDetects `bin_kind=NULL` (legacy)
   - [ ] Decrements `qty` and `reserved_qty` atomically
   - [ ] Inventory reflects sale

### Test 2: Pack-For-You Order Flow (Bulk Bins)

**Scenario**: Customer orders 2.5 lbs of bulk product (pack_for_you)

1. [ ] **Storefront**
   - [ ] Product has `bin_kind='bulk_weight'`
   - [ ] Order mode forced to 'pack_for_you'
   - [ ] Shows weight entry (NOT WeightBinSelector)
   - [ ] Customer enters 2.5 lbs
   - [ ] Calls `reserve_product_inventory()` → increments `reserved_lbs`
   - [ ] Order stored with `selected_bins = [{ package_key: 'product-1|bulk', qty: 2.5, bin_kind: 'bulk_weight' }]`

2. [ ] **Huckster-UI Finalize**
   - [ ] Manager opens order in finalize_sale_v2
   - [ ] Calls `fulfill_order_line()` with bulk selected_bins
   - [ ] RPC detects `bin_kind='bulk_weight'`
   - [ ] Decrements `qty_lbs` and `reserved_lbs` atomically
   - [ ] Inventory reflects sale

### Test 3: Oversell Prevention (CHECK Constraint)

**Scenario**: Try to reserve more than available

1. [ ] **Legacy Oversell**
   - [ ] Create bin with qty=5, reserved_qty=3 (2 available)
   - [ ] Try to reserve 3 more → RPC raises error ✓

2. [ ] **Bulk Oversell**
   - [ ] Create bulk bin with qty_lbs=10.0, reserved_lbs=5.0 (5.0 available)
   - [ ] Try to reserve 6.0 lbs → RPC raises error ✓
   - [ ] Try direct SQL insert reserved_lbs=11.0 → CHECK constraint blocks ✓

### Test 4: Mixed Inventory (Legacy + Bulk for same product)

**Scenario**: Product has both legacy bins AND bulk bin

1. [ ] **Inventory Aggregation**
   - [ ] Create product with 2 legacy bins: qty=5 (3 available) + qty=3 (2 available)
   - [ ] Create bulk bin: qty_lbs=8.0, reserved_lbs=2.0 (6.0 available)
   - [ ] `lbsOnHand()` or useStorefrontData returns:
     - [ ] Legacy: (3 + 2) = 5 packages
     - [ ] Bulk: 6.0 lbs
     - [ ] Total inventory shows both ✓

2. [ ] **Ordering behavior**
   - [ ] Legacy bins still show "Choose Package Size" (if offered)
   - [ ] Bulk bin forces 'pack_for_you' override
   - [ ] Both paths work independently

---

## Deployment Checklist

### Pre-Production

- [ ] All migrations deployed to staging
- [ ] RPC functions created/updated in staging
- [ ] Storefront edge function deployed to staging
- [ ] Huckster-UI edge function deployed to staging
- [ ] Smoke tests pass on staging

### Production Rollout

- [ ] Schema migrations run (no existing data affected)
- [ ] RPC functions deployed
- [ ] Edge functions deployed atomically
- [ ] Monitor for errors in logs
- [ ] Verify check constraint in logs (no violations)
- [ ] Smoke tests run on production

### Post-Deployment

- [ ] Customer tests 2.5 lb bulk order in storefront
- [ ] Manager finalizes bulk order in Huckster-UI
- [ ] Verify reserved_lbs and qty_lbs decremented correctly
- [ ] No regressions in legacy (exact_package) orders
- [ ] Inventory reports accurate

---

## Rollback Plan

If issues occur:

1. **Schema safe**: bin_kind, qty_lbs, reserved_lbs are NULLable and don't affect legacy data
2. **Disable features**:
   - Set all `bin_kind='bulk_weight'` bins to NULL (reverts to legacy)
   - This disables bulk ordering until root cause is fixed

3. **Revert code**:
   - Revert ProductCard changes (removes override to pack_for_you)
   - Revert useStorefrontData (uses only qty/reserved_qty)

---

## Sign-Off

- [ ] All 8 phases verified
- [ ] All tests pass
- [ ] No regressions in legacy flows
- [ ] Performance acceptable
- [ ] Ready for customer testing

**Date Completed**: ___________
**Tester Name**: ___________
**Notes**: ___________

