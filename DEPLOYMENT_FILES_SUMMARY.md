# Bulk Weight Bin Implementation - Files Summary

## 🚀 DEPLOYMENT FILES (Must Deploy)

### Database Schema Migrations (5 files)

#### 1. **purveyos-storefront/supabase/migrations/20260214_add_bulk_weight_bin_support.sql**
**Status**: UPDATED (was pack_qty-based, now qty_lbs-based)
**Purpose**: Add bulk weight columns to storefront
**Changes Made**:
- Added: `bin_kind TEXT NULL` (defaults NULL for legacy, set to 'bulk_weight' for bulk)
- Added: `qty_lbs NUMERIC NULL` (for bulk bins, weight on hand)
- Added: `reserved_lbs NUMERIC NOT NULL DEFAULT 0` (for bulk bins, weight reserved)
- Added: CHECK constraint `reserved_lbs <= qty_lbs OR bin_kind IS NULL`
- Added: Unique index `(tenant_id, product_id) WHERE bin_kind='bulk_weight'`
- Removed: pack_qty, reserved_pack_qty, avg_pack_weight, inventory_style columns (no longer used)

---

#### 2. **Huckster-UI/supabase/migrations/20260214_add_bulk_weight_bin_option_a.sql**
**Status**: NEW (mirrors storefront exactly)
**Purpose**: Ensure Huckster-UI has identical bulk schema
**Changes Made**:
- Same as #1 above (bin_kind, qty_lbs, reserved_lbs, indexes, CHECK constraint)
- Note: Huckster-UI and purveyos-storefront share same Supabase instance, so schema only needs to run once

---

#### 3. **Huckster-UI/supabase/migrations/20260214_phase3_bulk_bin_helpers.sql**
**Status**: NEW
**Purpose**: Create helper RPCs for bulk bin operations
**Changes Made**:
- Created RPC: `ensure_bulk_bin_exists(product_id, tenant_id, unit_price_cents)`
  - Idempotent: returns existing bulk bin if found, creates if not
  - Sets `package_key = '{productId}|bulk'`
  - Sets `bin_kind = 'bulk_weight'`
  - Returns (success, package_key)
  
- Created RPC: `receive_bulk_inventory(product_id, tenant_id, weight_lbs, pack_count)`
  - Atomically increments bulk bin's `qty_lbs`
  - Optionally increments `pack_qty` field for tracking

---

#### 4. **Huckster-UI/supabase/migrations/20260214_phase4_reservation_rpcs.sql**
**Status**: NEW
**Purpose**: Create/update reservation RPCs with bulk support
**Changes Made**:
- Updated RPC: `reserve_selected_bins(p_tenant_id, p_selected_bins, p_order_id, p_expiration_minutes)`
  - **Legacy path** (bin_kind=NULL):
    - Increments `reserved_qty += packs` (existing behavior)
  - **Bulk path** (bin_kind='bulk_weight'):
    - Increments `reserved_lbs += requested_lbs`
    - Validates: `qty_lbs - reserved_lbs >= requested_lbs` (throws error if insufficient)
  - Uses FOR UPDATE lock for concurrency control

- Created RPC: `reserve_product_inventory(p_tenant_id, p_order_id, p_order_line_id, p_product_id, p_requested_weight_lbs)` (NEW)
  - For pack-for-you orders
  - If product has bulk bin: reserves `reserved_lbs += requested_weight_lbs`
  - Else: falls back to legacy `product_reservations` insertion

---

#### 5. **Huckster-UI/supabase/migrations/20251216000005_create_fulfill_order_line_rpc.sql**
**Status**: UPDATED (existing file, bulk support added)
**Purpose**: Decrement inventory on finalize
**Changes Made**:
- Updated RPC: `fulfill_order_line(p_tenant_id, p_selected_bins, ...)`
  - Detects `bin_kind` from `selected_bins[0]`
  - **Legacy path** (bin_kind=NULL):
    - Decrements both `qty -= packs` and `reserved_qty -= packs`
    - Validates before decrement
  - **Bulk path** (bin_kind='bulk_weight'):
    - Decrements both `qty_lbs -= lbs` and `reserved_lbs -= lbs`
    - Validates: `qty_lbs - reserved_lbs >= lbs` before decrement
    - Throws error if insufficient

---

### Edge Functions (2 files updated)

#### 6. **purveyos-storefront/supabase/functions/create-storefront-order/index.ts**
**Status**: UPDATED (removed decrement logic)
**Purpose**: Storefront creates order and reserves inventory (reserve-only)
**Changes Made**:
- **REMOVED**: All decrement logic (~36 lines, lines 484-520)
  - Removed `UPDATE package_bins SET qty = qty - ...`
  - Removed all product.qty updates
- **KEPT**: 
  - Calls `reserve_selected_bins()` RPC for exact_package orders
  - Calls `reserve_product_inventory()` RPC for pack-for-you orders
- **Result**: Function now only reserves, never decrements. All inventory updates go through RPC.

---

#### 7. **Huckster-UI/supabase/functions/create-storefront-order/index.ts**
**Status**: UPDATED (added bulk metadata)
**Purpose**: Huckster-UI stores bulk order metadata
**Changes Made**:
- **ADDED**: Bulk bin detection in pack-for-you loop
  - If product has bulk bin (detected via RLS query), build selectedBinsArr entry:
    ```typescript
    selectedBinsArr.push({
      package_key: `${productId}|bulk`,
      qty: requestedWeightLbs,
      bin_kind: 'bulk_weight'
    });
    ```
  - This metadata is stored on `order_line.selected_bins` for finalize to consume
- **ADDED**: Call to `reserve_product_inventory()` RPC with `p_requested_weight_lbs`
- **KEPT**: No decrement logic (only reserves)

---

### Frontend Files (3 files updated)

#### 8. **purveyos-storefront/src/types/product.ts**
**Status**: UPDATED (added bulk fields to interface)
**Purpose**: TypeScript type definitions
**Changes Made**:
- Updated `Product.weightBins` array type from:
  ```typescript
  weightBins?: Array<{
    weightBtn: number;
    unitPriceCents: number;
    qty: number;
    reservedQty?: number;
  }>;
  ```
  To:
  ```typescript
  weightBins?: Array<{
    weightBtn: number;
    unitPriceCents: number;
    qty: number;
    reservedQty?: number;
    binKind?: string | null; // null = legacy, 'bulk_weight' = bulk
    qtyLbs?: number | null; // bulk only: weight on hand
    reservedLbs?: number; // bulk only: weight reserved
  }>;
  ```

---

#### 9. **purveyos-storefront/src/components/ProductCard.tsx**
**Status**: UPDATED (added bulk detection + mode override)
**Purpose**: Storefront product card UI
**Changes Made**:
- **ADDED** after line 193 (before hasBins):
  ```typescript
  // Detect if product has a bulk bin (bin_kind='bulk_weight')
  const hasBulkBin = !!(product.weightBins && product.weightBins.some(b => b.binKind === 'bulk_weight'));
  ```

- **CHANGED** line 206 (effectiveOrderMode assignment):
  - Before: `const effectiveOrderMode = tenantDefaultOrderMode ?? 'exact_package';`
  - After: `const effectiveOrderMode = hasBulkBin ? 'pack_for_you' : (tenantDefaultOrderMode ?? 'exact_package');`

- **CHANGED** line 502 (weight-based condition for exact_package):
  - Before: `) : hasBins ? (`
  - After: `) : (hasBins && !hasBulkBin) ? (`

- **CHANGED** line 603 (fixed-price condition for exact_package):
  - Before: `{hasBins ? (`
  - After: `{(hasBins && !hasBulkBin) ? (`

**Result**: Bulk products force 'pack_for_you' mode and never show WeightBinSelector modal.

---

#### 10. **purveyos-storefront/src/hooks/useStorefrontData.ts**
**Status**: UPDATED (fetch + inventory branching)
**Purpose**: Fetch product data from cloud with bulk support
**Changes Made**:
- **CHANGED** line 227 (SELECT query):
  - Before: `select('product_id, weight_btn, unit_price_cents, qty, reserved_qty')`
  - After: `select('product_id, weight_btn, unit_price_cents, qty, reserved_qty, bin_kind, qty_lbs, reserved_lbs')`

- **CHANGED** line 305 (binsByProduct map type):
  - Before: `new Map<string, Array<{ weightBtn: number; unitPriceCents: number; qty: number; reservedQty?: number }>>();`
  - After: `new Map<string, Array<{ weightBtn: number; unitPriceCents: number; qty: number; reservedQty?: number; binKind?: string | null; qtyLbs?: number | null; reservedLbs?: number }>>();`

- **CHANGED** line 311 (bin mapping):
  - Before:
    ```typescript
    binsByProduct.get(bin.product_id)!.push({
      weightBtn: bin.weight_btn,
      unitPriceCents: bin.unit_price_cents,
      qty: bin.qty,
      reservedQty: bin.reserved_qty || 0,
    });
    ```
  - After:
    ```typescript
    binsByProduct.get(bin.product_id)!.push({
      weightBtn: bin.weight_btn,
      unitPriceCents: bin.unit_price_cents,
      qty: bin.qty,
      reservedQty: bin.reserved_qty || 0,
      binKind: bin.bin_kind || null,
      qtyLbs: bin.qty_lbs || null,
      reservedLbs: bin.reserved_lbs || 0,
    });
    ```

- **CHANGED** line 354 (inventory aggregation, added branching):
  - Before:
    ```typescript
    const totalInventory = allBins
      ? allBins.reduce((sum, bin) => sum + ((bin.qty - (bin.reservedQty || 0)) || 0), 0)
      : 0;
    ```
  - After:
    ```typescript
    const totalInventory = allBins
      ? allBins.reduce((sum, bin) => {
          if (bin.binKind === 'bulk_weight') {
            // Bulk bin: use lbs directly
            return sum + Math.max(0, (bin.qtyLbs || 0) - (bin.reservedLbs || 0));
          } else {
            // Legacy bin: use qty (packs)
            return sum + Math.max(0, (bin.qty - (bin.reservedQty || 0)) || 0);
          }
        }, 0)
      : 0;
    ```

- **CHANGED** line 367 (availableBins filter, added branching):
  - Before:
    ```typescript
    const availableBins = allBins
      ? allBins.filter(bin => (bin.qty - (bin.reservedQty || 0)) > 0)
      : undefined;
    ```
  - After:
    ```typescript
    const availableBins = allBins
      ? allBins.filter(bin => {
          if (bin.binKind === 'bulk_weight') {
            // Bulk bin: check lbs available
            return (bin.qtyLbs || 0) - (bin.reservedLbs || 0) > 0;
          } else {
            // Legacy bin: check qty available
            return (bin.qty - (bin.reservedQty || 0)) > 0;
          }
        })
      : undefined;
    ```

---

## 📚 DOCUMENTATION FILES (Not Deployed)

These are reference/testing docs, NOT code to deploy:

#### 1. **purveyos-storefront/BULK_WEIGHT_BIN_SMOKE_TESTS.md**
- Comprehensive test checklist for all 8 phases
- Manual testing procedures
- SQL validation commands
- End-to-end flow tests

#### 2. **purveyos-storefront/BULK_WEIGHT_BIN_IMPLEMENTATION_SUMMARY.md**
- Overview of what was built
- Architectural decisions
- File changes summary
- Testing & validation procedures

#### 3. **Huckster-UI/PHASE_8_POS_BULK_SUPPORT.md**
- Optional Phase 8 implementation guide (POS support)
- Not needed for current deployment
- Explains how to add bulk support to Huckster-UI POS UI
- Database updates, component suggestions, testing

---

## 📋 Deployment Order

Deploy in this order to avoid RPC dependency issues:

1. **Database Schemas** (migrations)
   - `20260214_add_bulk_weight_bin_support.sql` (runs on both codebases)
   - `20260214_phase3_bulk_bin_helpers.sql`
   - `20260214_phase4_reservation_rpcs.sql`
   - `20251216000005_create_fulfill_order_line_rpc.sql` (update existing)

2. **Edge Functions** (deploy together)
   - `purveyos-storefront/supabase/functions/create-storefront-order/index.ts`
   - `Huckster-UI/supabase/functions/create-storefront-order/index.ts`

3. **Frontend** (can deploy independently)
   - `src/types/product.ts`
   - `src/components/ProductCard.tsx`
   - `src/hooks/useStorefrontData.ts`

---

## ✅ What Each File Does

### Reserved vs Bulk Logic Flow

**Storefront (reserve-only)**:
1. Customer adds item
2. `create-storefront-order` calls `reserve_selected_bins()` or `reserve_product_inventory()`
3. RPC increments `reserved_qty` (legacy) or `reserved_lbs` (bulk)
4. **Does NOT decrement `qty` or `qty_lbs`**
5. Order saved with `selected_bins` containing bin_kind hint

**Huckster-UI (decrement-only)**:
1. Manager opens order in finalize_sale_v2
2. Calls `fulfill_order_line()` 
3. RPC extracts `bin_kind` from `selected_bins`
4. Decrements both qty AND reserved_qty (or qty_lbs AND reserved_lbs) atomically
5. CHECK constraint prevents oversell

### Why These Changes?

| File | Why Changed | Impact |
|------|------------|--------|
| schema migration | Add bulk columns | Enable qty_lbs/reserved_lbs tracking |
| reserve_selected_bins | Add bulk branch | Handle weight reservations |
| reserve_product_inventory | NEW | Pack-for-you bulk support |
| fulfill_order_line | Add bulk branch | Decrement lbs instead of packs |
| create-storefront-order (SF) | Remove decrement | Enforce reserve-only |
| create-storefront-order (HUI) | Add metadata | Pass bulk hints to finalize |
| ProductCard | Add hasBulkBin | Force pack_for_you for bulk |
| useStorefrontData | Add branching | Inventory aggregates by kind |

---

## 🚫 What Was NOT Used

These files mentioned in conversation but **NOT part of actual deployment**:

- OLD: `20260214_add_bulk_weight_bin_support_pack_qty_version.sql` (superseded)
- DOCS: All .md files (reference only, not deployed code)
- OPTIONAL: Phase 8 POS files (future, not needed now)

---

## Summary: 10 Files to Deploy, 3 Docs for Reference

**Total Actual Changes**: 10 files
- 5 database migrations
- 2 edge functions updated
- 3 frontend files updated

**Total Reference Docs**: 3 files (not deployed, for testing & understanding)

All changes maintain backward compatibility (legacy bins unaffected).
