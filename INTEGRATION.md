# PurveyOS Storefront Integration

This document outlines the complete integration between the PurveyOS point-of-sale system and the customer-facing storefront application.

## Overview

The storefront provides a customer-facing interface for farms and food producers to sell products online, with real-time inventory sync from their PurveyOS POS system and order management integrated back into their main dashboard.

## Key Features

### 🏪 Multi-Tenant Storefronts
- Each PurveyOS tenant gets their own subdomain: `{tenant-slug}.purveyos.store`
- Storefront access is gated by "PRO + Webhosting" subscription plan
- Customizable templates: Modern, Classic, and Minimal themes
- Brand customization: colors, logo, hero images, farm description

### 🔄 Real-Time Integration
- **Inventory Sync**: Products marked as "online" in PurveyOS appear in storefront
- **Order Flow**: Online orders flow back into PurveyOS Orders screen
- **Notifications**: Instant notifications to farm owners when orders are placed
- **Offline-First**: POS continues working offline, syncs when connected

### 💳 Flexible Payment Options
- Venmo integration (manual reconciliation)
- Zelle integration (manual reconciliation) 
- Credit card processing via Stripe Connect (future)
- Cash on pickup/delivery option

### 📦 Fulfillment Methods
- Local pickup coordination
- Delivery scheduling
- Special instructions support

## Architecture

### Domain Structure
- **purveyos.com**: Marketing website and company information
- **purveyos.io** (or **www.purveyos.io**): PurveyOS dashboard and POS application
- **\*.purveyos.store**: Individual farm storefronts (e.g., `happyacres.purveyos.store`)

### Database Schema

#### Products Integration
```sql
-- Enhanced products table with online availability
ALTER TABLE products ADD COLUMN is_online BOOLEAN DEFAULT false;
```

#### Storefront Settings
```sql
CREATE TABLE storefront_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    domain_slug TEXT UNIQUE,
    template_id TEXT DEFAULT 'modern',
    primary_color TEXT DEFAULT '#0f6fff',
    accent_color TEXT DEFAULT '#ffcc00',
    logo_url TEXT,
    hero_image_url TEXT,
    hero_heading TEXT,
    hero_subtitle TEXT,
    farm_name TEXT,
    farm_description TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Order Management
```sql
-- Orders now include source tracking
ALTER TABLE orders ADD COLUMN order_source TEXT DEFAULT 'pos'; -- 'pos' or 'online'
ALTER TABLE orders ADD COLUMN delivery_method TEXT; -- 'pickup' or 'delivery'
ALTER TABLE orders ADD COLUMN delivery_address TEXT;
ALTER TABLE orders ADD COLUMN payment_method TEXT; -- 'venmo', 'zelle', 'card', 'cash'
ALTER TABLE orders ADD COLUMN payment_details TEXT;
```

### Security & Multi-Tenancy

#### Row-Level Security (RLS)
```sql
-- Tenant isolation for all storefront data
CREATE POLICY tenant_isolation ON storefront_settings
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM get_current_user_tenant()));

CREATE POLICY storefront_public_read ON storefront_settings
    FOR SELECT USING (true); -- Public read for storefronts

CREATE POLICY tenant_products_public ON products
    FOR SELECT USING (is_online = true); -- Only online products visible
```

#### User Role Hierarchy
- **Owner**: Full access to all tenant features
- **Admin**: Most features except billing/subscription management
- **Staff**: Basic POS and inventory management  
- **Viewer**: Read-only dashboard access

## Technical Implementation

### PurveyOS (Huckster-UI) Enhancements

#### Storefront Management Screen
**Location**: `src/screens/settings/StorefrontSettingsScreen.tsx`

Features:
- Enable/disable storefront for tenant
- Configure domain slug (auto-generates `{slug}.purveyos.store`)
- Template selection and customization
- Brand asset management
- Live preview of storefront settings

#### Product Management Integration
**Files**: 
- `src/screens/inventory/EditProductScreen.tsx`
- `src/screens/inventory/NewProductScreen.tsx`

Features:
- "Available Online" toggle for each product
- Batch operations to enable/disable online availability
- Visual indicators for products visible in storefront

#### Order Management Enhancement
**Location**: `src/screens/orders/OrdersScreen.tsx`

Features:
- Order source indication (POS vs Online)
- Customer contact details for online orders
- Delivery method and address display
- Payment method tracking

#### Database Synchronization
**File**: `src/lib/sync.ts`

Enhanced sync to include:
- Storefront settings synchronization
- Product online availability status
- Online order creation and updates

### Storefront Application

#### Data Integration
**File**: `src/hooks/useStorefrontData.ts`

Real-time data fetching:
```typescript
// Fetch storefront settings
const settingsResult = await supabase
  .from('storefront_settings')
  .select('*')
  .eq('tenant_id', tenantId)
  .single();

// Fetch online products only
const productsResult = await supabase
  .from('products')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('is_online', true)
  .order('name');
```

#### Tenant Resolution
**File**: `src/hooks/useTenantFromDomain.ts`

Domain-based tenant resolution:
```typescript
// Extract tenant from subdomain
const subdomain = window.location.hostname.split('.')[0];

// Query tenant by domain slug
const { data: tenant } = await supabase
  .from('storefront_settings')
  .select('tenant_id, tenants(*)')
  .eq('domain_slug', subdomain)
  .single();
```

#### Checkout & Order Creation
**File**: `src/hooks/useCheckout.ts`

Complete order processing:
```typescript
// Create order in POS system
const { data: orderData } = await supabase
  .from('orders')
  .insert({
    tenant_id: tenantId,
    customer_name: checkoutData.customerName,
    order_source: 'online',
    status: 'pending'
    // ... other order details
  });

// Send notification to tenant
await supabase.functions.invoke('send-order-notification', {
  body: { tenant_id: tenantId, order_id: orderId }
});
```

## Environment Setup

### Storefront Environment Variables
```bash
# .env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your-key
```

### PurveyOS Environment Integration
The POS system shares the same Supabase project for seamless data integration.

## Development Workflow

### 1. Setting Up Local Development

```bash
# Storefront
cd purveyos-storefront
npm install
cp .env.example .env
# Configure environment variables
npm run dev

# POS System  
cd huckster-ui
npm install
npm run dev
```

### 2. Testing Integration

1. **Enable Storefront**: In POS → Settings → Storefront, enable storefront for a tenant
2. **Add Products**: Create products and toggle "Available Online"
3. **Configure Storefront**: Set up branding, template, and contact information
4. **Test Orders**: Place test orders through storefront, verify they appear in POS
5. **Test Sync**: Modify inventory in POS, confirm updates in storefront

### 3. Database Migrations

Required migrations are in the Huckster-UI project:
- `supabase/migrations/011_storefront_support.sql`
- `supabase/migrations/012_fix_user_roles.sql` 
- `supabase/migrations/013_storefront_access_control.sql`

## Deployment

### Wildcard Domain Setup
Configure DNS for `*.purveyos.store` to point to the storefront application, enabling dynamic subdomain routing.

### Edge Functions
Deploy Supabase Edge Functions for:
- Order notifications (`send-order-notification`)
- Payment processing (`process-payment`)

## Future Enhancements

### Phase 2: Advanced Features
- [ ] Stripe Connect credit card processing
- [ ] Inventory reservations and automated allocation
- [ ] Customer accounts and order history
- [ ] Advanced analytics and reporting
- [ ] Mobile app for customers
- [ ] Integration with delivery services

### Phase 3: Marketplace Features
- [ ] Multi-vendor marketplace support
- [ ] Farmer collaboration tools
- [ ] Wholesale ordering
- [ ] Subscription box management
- [ ] Community features and reviews

## Security Considerations

1. **Data Isolation**: Strict tenant isolation via RLS policies
2. **API Security**: Rate limiting and input validation
3. **Payment Security**: PCI compliance for card processing
4. **Access Control**: Role-based permissions throughout
5. **Audit Logging**: Track all administrative actions

## Support and Documentation

### For Farm Owners
- Storefront setup guide within POS interface
- Video tutorials for product management
- Best practices for online sales

### For Developers
- API documentation for custom integrations
- Webhook configuration for third-party services
- Custom template development guide

---

This integration provides a complete e-commerce solution for local food producers while maintaining the simplicity and offline-first approach of the PurveyOS POS system.