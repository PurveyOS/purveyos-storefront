# Purveyos Storefront Updates - Game Plan

## Overview
Two main objectives:
1. **Remove Classic Theme** - Eliminate the classic template entirely
2. **Add Product Descriptions** - Allow tenants to optionally add descriptions to products

---

## Part 1: Remove Classic Theme

### Current State Analysis
```
src/templates/
  ├── ClassicTemplate.tsx      ← REMOVE THIS
  ├── MinimalTemplate.tsx      ← Keep (set as default)
  ├── ModernFarmTemplate.tsx   ← Keep
  └── index.ts                 ← UPDATE: remove classic reference
```

### Files to Modify

#### 1. **src/templates/index.ts**
- Remove `ClassicTemplate` import
- Remove `classic: ClassicTemplate` from registry
- Change default fallback from `ClassicTemplate` to `MinimalTemplate`

**Before:**
```typescript
export const TEMPLATE_REGISTRY = {
  classic: ClassicTemplate,    // ← REMOVE
  minimal: MinimalTemplate,
  modern: ModernFarmTemplate,
};

export function getTemplate(templateId: string) {
  return TEMPLATE_REGISTRY[templateId] || ClassicTemplate; // ← CHANGE DEFAULT
}
```

**After:**
```typescript
export const TEMPLATE_REGISTRY = {
  minimal: MinimalTemplate,
  modern: ModernFarmTemplate,
};

export function getTemplate(templateId: string) {
  return TEMPLATE_REGISTRY[templateId] || MinimalTemplate; // New default
}
```

#### 2. **src/templates/ClassicTemplate.tsx**
- **DELETE THIS FILE ENTIRELY**

#### 3. **Check for references** (search across codebase)
- Search for: `"classic"`, `ClassicTemplate`, `classic-theme`
- Likely locations:
  - Settings screens
  - Theme selector components
  - Default config values
  - Documentation

#### 4. **Database/Config Updates** (if template stored in DB)
- Check `tenants` table or `storefront_settings` for `theme` column
- Update any tenants with `theme: 'classic'` to `'minimal'`
- Consider migration SQL:
  ```sql
  UPDATE tenants 
  SET storefront_theme = 'minimal' 
  WHERE storefront_theme = 'classic';
  ```

---

## Part 2: Add Product Descriptions

### Current State Analysis
**Products schema likely includes:**
- `id`, `name`, `price`, `unit`, `category_id`, `tenant_id`
- **Missing:** `description` column

### Implementation Options

#### **Option A: Simple Description Column (RECOMMENDED)**
Add a single `description` text field to products table.

**Pros:**
- Simple to implement
- Easy for tenants to use
- No UI complexity
- Works with existing product management

**Cons:**
- Limited formatting (plain text only)
- No rich text/markdown support

**Schema Change:**
```sql
-- Add description column to products table
ALTER TABLE products 
ADD COLUMN description TEXT DEFAULT NULL;

-- Allow null values (optional descriptions)
```

#### **Option B: Rich Text Description (Advanced)**
Add description with markdown/HTML support.

**Pros:**
- Better formatting (bold, lists, links)
- More professional appearance
- Better for detailed product info

**Cons:**
- Requires markdown editor in UI
- More complex to render safely
- Needs sanitization for XSS

**Schema Change:**
```sql
ALTER TABLE products 
ADD COLUMN description TEXT DEFAULT NULL,
ADD COLUMN description_format VARCHAR(20) DEFAULT 'plain' CHECK (description_format IN ('plain', 'markdown', 'html'));
```

---

## Recommended Implementation Plan

### Phase 1: Remove Classic Theme (30-45 min)

#### Step 1: Update Template Registry
```bash
File: src/templates/index.ts
```
- Remove `ClassicTemplate` import
- Remove from `TEMPLATE_REGISTRY`
- Change default to `MinimalTemplate`

#### Step 2: Delete Classic Template
```bash
File: src/templates/ClassicTemplate.tsx
```
- Delete the entire file

#### Step 3: Find & Update References
Search codebase for:
- `"classic"` (string references)
- `ClassicTemplate` (component references)
- Theme selectors in UI

Likely locations:
- `src/pages/` - Settings pages
- `src/components/` - Theme selector components
- `src/types/` - Type definitions

#### Step 4: Database Migration (if needed)
```sql
-- Check if any tenants use classic theme
SELECT id, farm_name, storefront_theme 
FROM tenants 
WHERE storefront_theme = 'classic';

-- Update to minimal
UPDATE tenants 
SET storefront_theme = 'minimal' 
WHERE storefront_theme = 'classic';
```

#### Step 5: Test
- Browse storefront as different tenants
- Verify minimal template renders correctly
- Check theme selector (if exists) no longer shows "Classic"

---

### Phase 2: Add Product Descriptions (1-2 hours)

#### Step 1: Database Migration
```sql
-- Add description column to products table
ALTER TABLE products 
ADD COLUMN description TEXT DEFAULT NULL;

-- Update RLS policies if needed (same as other product columns)
```

#### Step 2: Update Product Types
```typescript
// File: src/types/product.ts (or similar)
export interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  categoryId: string;
  tenantId: string;
  description?: string | null;  // ← ADD THIS
  // ... other fields
}
```

#### Step 3: Update Storefront Templates
Each template needs to display description if present:

**File: `src/templates/MinimalTemplate.tsx`**
```tsx
{/* Product Card */}
<div className="bg-white rounded-lg shadow-sm p-4">
  <h3 className="text-lg font-medium">{product.name}</h3>
  
  {/* ADD THIS: Show description if available */}
  {product.description && (
    <p className="text-sm text-gray-600 mt-2">
      {product.description}
    </p>
  )}
  
  <p className="text-2xl font-bold mt-2">${product.price}</p>
  {/* ... rest of product card */}
</div>
```

**File: `src/templates/ModernFarmTemplate.tsx`**
- Add same description display logic

#### Step 4: Update Product Management (huckster-ui)
This is where tenants will ADD descriptions.

**File: `huckster-ui/src/screens/NewProductScreen.tsx`**
```tsx
{/* Add description field */}
<div>
  <label>Description (Optional)</label>
  <textarea
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    placeholder="Add a description for this product..."
    rows={3}
    className="w-full border rounded p-2"
  />
  <p className="text-xs text-gray-500 mt-1">
    This will appear on your storefront
  </p>
</div>
```

**File: `huckster-ui/src/screens/EditProductScreen.tsx`**
- Add same description field

#### Step 5: Update Database Queries
**File: `huckster-ui/src/services/inventory.ts` (or product service)**
```typescript
// When creating product
const { data, error } = await supabase
  .from('products')
  .insert({
    name,
    price,
    unit,
    category_id,
    tenant_id,
    description,  // ← ADD THIS
  });

// When updating product
const { data, error } = await supabase
  .from('products')
  .update({
    name,
    price,
    unit,
    description,  // ← ADD THIS
  })
  .eq('id', productId);
```

**File: `purveyos-storefront/src/hooks/useProducts.ts` (or similar)**
```typescript
// Ensure SELECT includes description
const { data: products } = await supabase
  .from('products')
  .select('*, description')  // ← ADD description to SELECT
  .eq('tenant_id', tenantId);
```

#### Step 6: UI Polish (Optional)
- Character limit (e.g., 500 chars)
- Line break handling
- Markdown support (future enhancement)

---

## Testing Checklist

### Classic Theme Removal
- [ ] Storefront loads with minimal/modern templates
- [ ] No console errors about missing ClassicTemplate
- [ ] Theme selector (if exists) doesn't show classic option
- [ ] All existing tenants can view their storefronts
- [ ] No broken imports or references

### Product Descriptions
- [ ] Database column added successfully
- [ ] Can create new product with description
- [ ] Can create new product WITHOUT description (optional)
- [ ] Can edit existing product to add description
- [ ] Description appears on storefront
- [ ] Description wraps properly on mobile
- [ ] Line breaks display correctly
- [ ] Empty descriptions don't break layout
- [ ] Long descriptions don't overflow

---

## Migration Plan

### For Production Deployment:

#### 1. Database Migration (run first)
```sql
-- Add description column
ALTER TABLE products ADD COLUMN description TEXT DEFAULT NULL;

-- Migrate classic theme users
UPDATE tenants SET storefront_theme = 'minimal' WHERE storefront_theme = 'classic';
```

#### 2. Deploy purveyos-storefront
- Build and deploy updated storefront code
- Verify templates load correctly

#### 3. Deploy huckster-ui
- Build and deploy updated POS with description fields
- Test product creation/editing

#### 4. Notify Tenants (optional)
- Email announcing new product descriptions feature
- Guide on how to add descriptions to products

---

## Potential Issues & Solutions

### Issue 1: Tenants with `theme: 'classic'` see blank storefront
**Solution:** Database migration (Step 1 above) updates all before deployment

### Issue 2: Existing products have null descriptions
**Solution:** This is expected and fine - descriptions are optional

### Issue 3: Long descriptions break layout
**Solution:** Add CSS truncation or character limits:
```css
.product-description {
  max-height: 4.5em; /* ~3 lines */
  overflow: hidden;
  text-overflow: ellipsis;
}
```

### Issue 4: Users want rich text formatting
**Solution:** Phase 2 enhancement - add markdown support later

---

## Timeline Estimate

| Task | Time | Priority |
|------|------|----------|
| Remove ClassicTemplate file | 5 min | HIGH |
| Update template registry | 10 min | HIGH |
| Find/fix references | 20 min | HIGH |
| Database migration (classic→minimal) | 5 min | HIGH |
| Test theme removal | 10 min | HIGH |
| **SUBTOTAL: Theme Removal** | **~45 min** | |
| Add description column to DB | 5 min | MEDIUM |
| Update Product types | 10 min | MEDIUM |
| Update storefront templates | 30 min | MEDIUM |
| Update huckster-ui forms | 30 min | MEDIUM |
| Update database queries | 15 min | MEDIUM |
| Testing | 20 min | HIGH |
| **SUBTOTAL: Descriptions** | **~2 hours** | |
| **TOTAL** | **~2.75 hours** | |

---

## Next Steps

1. **Confirm Approach**: Review this plan and confirm both changes
2. **Start with Theme Removal**: Low risk, quick win
3. **Then Add Descriptions**: More involved but straightforward
4. **Test Thoroughly**: Especially storefront rendering
5. **Deploy**: Database → Storefront → POS

---

## Questions to Answer Before Starting

1. **Does the `products` table already have a description column?**
   - Check schema in Supabase dashboard or via SQL query

2. **Where is the theme selector UI?**
   - Check if there's a theme picker in huckster-ui settings
   - May need to remove "Classic" option from dropdown

3. **Are there any tenants actively using classic theme?**
   - Query database: `SELECT COUNT(*) FROM tenants WHERE storefront_theme = 'classic'`

4. **Do you want rich text or plain text descriptions?**
   - Recommendation: Start with plain text, add markdown later if needed

5. **Character limit for descriptions?**
   - Recommendation: 500-1000 characters
   - Can add validation in UI and database constraint

---

## Ready to Start?

Let me know and I can:
1. Check the current products schema
2. Search for all Classic theme references
3. Begin implementing the changes step-by-step
