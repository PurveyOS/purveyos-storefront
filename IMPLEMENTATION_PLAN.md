# Storefront Implementation Plan 🚀

## Current Status ✅
- **PurveyOS Integration**: Complete with storefront settings screen
- **Database Schema**: Migration 011, 012, 013 ready to deploy
- **Domain Resolution**: Logic implemented, ready for Supabase integration
- **Security**: Role-based access control with tenant isolation

## Next Implementation Steps

### Phase 1: Complete Storefront Backend Integration

#### 1. Install Dependencies
```bash
cd purveyos-storefront
npm install @supabase/supabase-js @stripe/stripe-js
```

#### 2. Environment Variables
```env
# Add to .env.local
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

#### 3. Update Components to Use Real Data
- Replace `useStorefrontData` mock with Supabase queries
- Update product fetching to filter by `is_online = true`
- Implement real storefront settings loading

### Phase 2: Domain & Hosting Setup

#### Option A: Wildcard Subdomain (Recommended)
```dns
*.purveyos.store  CNAME  your-hosting-platform
```
**Domain Structure:**
- `purveyos.com` → Marketing site
- `purveyos.io` or `www.purveyos.io` → PurveyOS dashboard  
- `*.purveyos.store` → Customer storefronts

**Hosting Platforms:**
- Vercel: Automatic wildcard support
- Netlify: Custom domain with wildcard
- Cloudflare Pages: Wildcard routing

#### Option B: Individual Subdomains  
```dns
sweetpastures.purveyos.store  CNAME  your-hosting
greenvally.purveyos.store     CNAME  your-hosting
```

### Phase 3: Order Processing Flow

#### 3A: Shopping Cart Enhancement
- Persist cart in localStorage (already working)
- Add quantity validation against available stock
- Calculate tax and totals

#### 3B: Checkout Process
```typescript
// Checkout flow:
1. Validate cart items and availability
2. Collect customer info and fulfillment method
3. Calculate final totals
4. Process payment (Card/Venmo/Zelle)
5. Create order in database
6. Send notification to tenant
7. Clear cart and show confirmation
```

#### 3C: Payment Integration
- **Card Payments**: Stripe Elements + Edge Function
- **Venmo/Zelle**: Instructions display + manual verification
- **Order Status**: Pending → Paid → Fulfilled

### Phase 4: Tenant Onboarding Flow

#### 4A: Subdomain Assignment
```typescript
// In PurveyOS signup/settings:
1. Check if tenant has PRO+Webhosting subscription
2. Allow subdomain selection (slug validation)
3. Update tenant.slug field
4. Enable storefront_enabled flag
5. Create default storefront_settings
```

#### 4B: Storefront Preview
- Add "Preview Storefront" button in PurveyOS
- Open tenant's subdomain in new tab
- Show setup checklist if not configured

## Technical Architecture

### Frontend Apps
```
PurveyOS (huckster-ui)           Storefront (purveyos-storefront)
├── Inventory Management         ├── Product Catalog  
├── Sales & Orders              ├── Shopping Cart
├── Storefront Settings         ├── Checkout Process
└── Tenant Management           └── Order Confirmation
```

### Database Tables
```sql
tenants              -- Farm/business info + subdomain
├── profiles         -- Users linked to tenants  
├── products         -- Inventory with is_online flag
├── storefront_settings -- Branding & config
├── orders           -- Customer orders from storefront  
└── order_lines      -- Order line items
```

### Domain Flow
```
1. customer visits: sweetpastures.purveyos.store
2. App extracts "sweetpastures" subdomain  
3. Queries tenants table for slug = "sweetpastures"
4. Loads tenant's products where is_online = true
5. Applies tenant's storefront_settings theme
6. Customer shops and places orders
7. Orders appear in PurveyOS Orders screen
```

## Security & Permissions

### Row Level Security (RLS)
- All tables have tenant_id isolation
- Storefront app uses anon key (read-only access)
- Order creation happens via secure Edge Functions
- No direct database writes from storefront frontend

### Role Hierarchy
- **Owner**: Full storefront management access
- **Admin**: Product management, no storefront settings  
- **Staff**: Sales only, no storefront access
- **Viewer**: Read-only access

## Deployment Checklist

### Before Launch
- [ ] Run all database migrations (011, 012, 013)
- [ ] Set up wildcard domain pointing to storefront app  
- [ ] Configure environment variables
- [ ] Test subdomain resolution
- [ ] Test order flow end-to-end
- [ ] Set up monitoring and error tracking

### Go-Live Process
1. Deploy storefront app with wildcard domain
2. Update PurveyOS to show storefront settings for PRO users
3. Enable storefront_enabled flag for beta tenants
4. Monitor for issues and iterate

## Success Metrics
- **Tenant Adoption**: % of PRO users enabling storefront
- **Order Volume**: Orders placed through storefront vs POS
- **Revenue**: Subscription upgrades to PRO+Webhosting  
- **Support**: Reduction in manual order processing

---

**Current Priority**: Complete Phase 1 (Supabase integration) and Phase 2 (domain setup) to have a fully functional demo ready for testing.