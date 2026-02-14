import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchStorefrontCatalog, fetchStorefrontProductsDirectRLS } from '../lib/storefrontApi';
import type { StorefrontData } from '../types/storefront';
import type { Product } from '../types/product';
import type { Category } from '../types/category';

const MOCK_SETTINGS = {
  templateId: "modern", // Change this to "classic", "minimal", or "modern"
  primaryColor: "#0f6fff",
  accentColor: "#ffcc00",
  logoUrl: "/demo-logo.svg",
  heroImageUrl: "/demo-hero.svg",
  heroHeading: "Farm Fresh Goodness",
  heroSubtitle: "From our pasture to your table.",
  farmName: "Demo Farm",
  farmDescription: "Premium quality meats from our family farm to your table.",
  contactEmail: "hello@demofarm.com",
  contactPhone: "(555) 123-4567",
  allow_pickup: true,
  allow_shipping: true,
  allow_dropoff: false,
  allow_other: false,
  shipping_charge_cents: 0,
  pickup_locations: [],
  dropoff_locations: [],
};

const MOCK_CATEGORIES: Category[] = [
  {
    id: "beef",
    name: "Beef",
    description: "Premium grass-fed beef cuts",
    imageUrl: "https://images.unsplash.com/photo-1588347818463-d34a1c0de0a6?w=400&h=300&fit=crop",
    sortOrder: 1,
  },
  {
    id: "pork",
    name: "Pork",
    description: "Pasture-raised pork products",
    imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop",
    sortOrder: 2,
  },
  {
    id: "chicken",
    name: "Chicken",
    description: "Free-range chicken products",
    imageUrl: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400&h=300&fit=crop",
    sortOrder: 3,
  },
];

const MOCK_PRODUCTS: Product[] = [
  {
    id: "ribeye-steak",
    name: "Ribeye Steak",
    description: "Premium grass-fed ribeye steak, perfectly marbled for exceptional flavor.",
    pricePer: 28.99,
    unit: "lb",
    imageUrl: "https://images.unsplash.com/photo-1558030006-450675393462?w=400&h=300&fit=crop",
    categoryId: "beef",
    available: true,
    inventory: 25,
  },
  {
    id: "ground-beef",
    name: "Ground Beef",
    description: "Lean grass-fed ground beef, perfect for burgers and family meals.",
    pricePer: 8.99,
    unit: "lb",
    imageUrl: "https://images.unsplash.com/photo-1607781105949-6e4b39d0453a?w=400&h=300&fit=crop",
    categoryId: "beef",
    available: true,
    inventory: 50,
  },
  {
    id: "pork-chops",
    name: "Bone-in Pork Chops",
    description: "Thick-cut bone-in pork chops from pasture-raised pigs.",
    pricePer: 12.99,
    unit: "lb",
    imageUrl: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&h=300&fit=crop",
    categoryId: "pork",
    available: true,
    inventory: 30,
  },
  {
    id: "bacon",
    name: "Thick-Cut Bacon",
    description: "Artisan thick-cut bacon with no artificial preservatives.",
    pricePer: 15.99,
    unit: "lb",
    imageUrl: "https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=400&h=300&fit=crop",
    categoryId: "pork",
    available: true,
    inventory: 40,
  },
  {
    id: "whole-chicken",
    name: "Whole Chicken",
    description: "Fresh whole chicken from free-range hens.",
    pricePer: 6.99,
    unit: "lb",
    imageUrl: "https://images.unsplash.com/photo-1543842533-20ae35aa19e5?w=400&h=300&fit=crop",
    categoryId: "chicken",
    available: true,
    inventory: 20,
  },
  {
    id: "chicken-breast",
    name: "Chicken Breast",
    description: "Boneless, skinless chicken breast fillets.",
    pricePer: 11.99,
    unit: "lb",
    imageUrl: "https://images.unsplash.com/photo-1604503468506-a8da13d82791?w=400&h=300&fit=crop",
    categoryId: "chicken",
    available: true,
    inventory: 35,
  },
];

export function useStorefrontData(tenantId: string): {
  data: StorefrontData | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<StorefrontData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        // If Supabase is not configured, fall back to mock data
        if (!supabase) {
          console.log('Supabase not configured, using mock data');
          // Simulate network delay
          await new Promise(resolve => setTimeout(resolve, 500));
          
          setData({
            settings: MOCK_SETTINGS,
            products: MOCK_PRODUCTS,
            categories: MOCK_CATEGORIES,
            tenantDefaultOrderMode: 'exact_package',
          });
          return;
        }

        // Fetch real data from Supabase
        console.log('Fetching data for tenant:', tenantId);
        
        // ============================================================================
        // PHASE B: Use Edge Function for public browsing (products + categories)
        // ============================================================================
        // Why Edge Function instead of direct RLS?
        // 1) Validates tenant existence before returning products
        // 2) Avoids header injection issues with supabase-js
        // 3) Provides strong server-side tenant isolation
        // 4) No expensive RLS subqueries = better performance
        //
        // Get tenant slug from localStorage (set by useTenantFromDomain)
        const tenantSlug = localStorage.getItem('tenant_slug');
        
        if (!tenantSlug) {
          throw new Error('Tenant slug not resolved');
        }

        // Fetch catalog via Edge Function (products + categories + tenant validation)
        let catalogData;
        try {
          catalogData = await fetchStorefrontCatalog(tenantSlug, {
            includeBins: true,
            includeCategories: true,
          });
        } catch (error) {
          console.error('❌ Edge Function failed, falling back to direct RLS:', error);
          // Fallback to direct RLS query (only if Edge Function is unavailable)
          const products = await fetchStorefrontProductsDirectRLS(tenantId);
          const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[]));
          catalogData = {
            tenant: { id: tenantId, slug: tenantSlug, name: '' },
            products,
            categories,
            bins: [],
          };
        }

        // ============================================================================
        // Fetch settings (still use supabase directly since it's scoped by tenant_id)
        // ============================================================================
        const { data: settingsData, error: settingsError } = await supabase
          .from('storefront_settings')
          .select('*')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (settingsError) {
          if ((settingsError as any).code === 'PGRST116') {
            console.warn('No storefront_settings row found; using defaults.');
          } else {
            console.error('Settings error:', settingsError);
            throw settingsError;
          }
        }

        // ============================================================================
        // Fetch tenant policy + default order mode
        // ============================================================================
        const { data: tenantPolicyData, error: tenantPolicyError } = await supabase
          .from('tenants')
          .select('storefront_payment_policy, storefront_default_order_mode')
          .eq('id', tenantId)
          .single();

        if (tenantPolicyError) {
          console.warn('Tenant policy fetch warning (non-critical):', tenantPolicyError);
        }

        // ============================================================================
        // Fetch package bins (for inventory/pricing info)
        // ============================================================================
        const { data: binsData, error: binsError } = await supabase
          .from('package_bins')
          .select('product_id, weight_btn, unit_price_cents, qty, reserved_qty')
          .eq('tenant_id', tenantId);

        if (binsError) {
          console.warn('Bins fetch warning (non-critical):', binsError);
        }

        // ============================================================================
        // Fetch subscription products (for subscription UI)
        // ============================================================================
        const { data: subscriptionsData, error: subscriptionsError } = await supabase
          .from('subscription_products')
          .select('id, product_id, price_per_interval, interval_type, duration_type, duration_intervals, season_start_date, season_end_date, min_interval, is_active')
          .eq('tenant_id', tenantId)
          .eq('is_active', true);

        if (subscriptionsError) {
          console.error('Subscriptions error:', subscriptionsError);
        }

        console.log('📦 Fetched catalog:', {
          products: catalogData.products.length,
          categories: catalogData.categories.length,
        });
        console.log('🔧 Settings:', settingsData);
        console.log('📦 Subscription products:', subscriptionsData?.length || 0);

        // ============================================================================
        // Transform settings data
        // ============================================================================
        const settings = settingsData ? {
          templateId: settingsData.template_id || "modern",
          primaryColor: settingsData.primary_color || "#0f6fff",
          accentColor: settingsData.accent_color || "#ffcc00",
          logoUrl: settingsData.logo_url || "/demo-logo.svg",
          heroImageUrl: settingsData.hero_image_url || "/demo-hero.svg",
          heroHeading: settingsData.hero_heading || "Farm Fresh Goodness",
          heroSubtitle: settingsData.hero_subtitle || "From our pasture to your table.",
          farmName: settingsData.farm_name || "Demo Farm",
          farmDescription: settingsData.farm_description,
          contactEmail: settingsData.contact_email,
          contactPhone: settingsData.contact_phone,
          darkMode: settingsData.enable_dark_mode || false,
          allow_pickup: settingsData.allow_pickup ?? false,
          allow_shipping: settingsData.allow_shipping ?? true,
          allow_dropoff: settingsData.allow_dropoff ?? false,
          allow_other: settingsData.allow_other ?? false,
          enable_card: settingsData.enable_card ?? settingsData.allow_card ?? false,
          allow_card: settingsData.allow_card ?? settingsData.enable_card ?? false,
          enable_cash: settingsData.enable_cash ?? false,
          enable_venmo: settingsData.enable_venmo ?? false,
          enable_zelle: settingsData.enable_zelle ?? false,
          enable_cashapp: (settingsData as any).enable_cashapp ?? false,
          shipping_charge_cents: settingsData.shipping_charge_cents ?? 0,
          pickup_locations: Array.isArray(settingsData.pickup_locations) ? settingsData.pickup_locations : [],
          dropoff_locations: Array.isArray(settingsData.dropoff_locations)
            ? settingsData.dropoff_locations.map((loc: any) => ({
                name: loc?.name || '',
                address: loc?.address || '',
                day: loc?.day || '',
                time: loc?.time || '',
              }))
            : [],
          storefront_payment_policy: (tenantPolicyData as any)?.storefront_payment_policy ?? 'pay_now',
          featureSections: Array.isArray(settingsData.feature_sections)
            ? settingsData.feature_sections.map((s: any) => ({
                imageUrl: s.image_url,
                heading: s.heading,
                subtitle: s.subtitle,
                ctaText: s.cta_text,
                ctaLink: s.cta_link,
              }))
            : []
        } : MOCK_SETTINGS;

        // ============================================================================
        // Group bins by product_id (for inventory/pricing)
        // ============================================================================
        const binsByProduct = new Map<string, Array<{ weightBtn: number; unitPriceCents: number; qty: number; reservedQty?: number }>>();
        if (binsData) {
          binsData.forEach((bin: any) => {
            if (!binsByProduct.has(bin.product_id)) {
              binsByProduct.set(bin.product_id, []);
            }
            binsByProduct.get(bin.product_id)!.push({
              weightBtn: bin.weight_btn,
              unitPriceCents: bin.unit_price_cents,
              qty: bin.qty,
              reservedQty: bin.reserved_qty || 0,
            });
          });
        }

        // ============================================================================
        // Group subscriptions by product_id
        // ============================================================================
        const subscriptionsByProduct = new Map<string, any>();
        if (subscriptionsData) {
          subscriptionsData.forEach((sub: any) => {
            subscriptionsByProduct.set(sub.product_id, {
              id: sub.id,
              price_per_interval: sub.price_per_interval,
              interval_type: sub.interval_type,
              min_interval: sub.min_interval,
              duration_type: sub.duration_type,
              duration_intervals: sub.duration_intervals ?? undefined,
              season_start_date: sub.season_start_date,
              season_end_date: sub.season_end_date,
            });
          });
        }

        // ============================================================================
        // Transform products from Edge Function response
        // ============================================================================
        const products: Product[] = (catalogData.products || []).map(p => {
          const allBins = binsByProduct.get(p.id);
          const subscriptionFromCatalog = (p as any).subscriptionData;
          const subscriptionFromDb = subscriptionsByProduct.get(p.id);
          const subscription = subscriptionFromCatalog
            ? { ...subscriptionFromCatalog, ...subscriptionFromDb }
            : subscriptionFromDb;
          const hasSubscription = Boolean((p as any).isSubscription || subscription);

          // Calculate total inventory from package_bins (fallback to product.qty when no bins)
          const totalInventory = allBins
            ? allBins.reduce((sum, bin) => sum + ((bin.qty - (bin.reservedQty || 0)) || 0), 0)
            : 0;
          const fallbackInventory = typeof (p as any).qty === 'number' ? (p as any).qty : 0;
          const effectiveInventory = allBins && allBins.length > 0 ? totalInventory : fallbackInventory;

          // Only include bins with available inventory
          const availableBins = allBins
            ? allBins.filter(bin => (bin.qty - (bin.reservedQty || 0)) > 0)
            : undefined;

          return {
            id: p.id,
            name: p.name,
            description: p.description || '',
            pricePer: subscription ? subscription.price_per_interval : (p.pricePer || 0),
            unit: p.unit || 'lb',
            variantSize: (p as any).variant_size ?? undefined,
            variantUnit: (p as any).variant_unit ?? undefined,
            weightBins: availableBins,
            imageUrl: p.image_url || p.image || '/demo-product.svg', // Prefer image_url (Storage), fallback to image (base64)
            categoryId: p.category || '',
            available: effectiveInventory > 0 || (p.allow_pre_order === true),
            inventory: effectiveInventory,
            allowPreOrder: p.allow_pre_order === true,
            isSubscription: hasSubscription,
            subscriptionData: subscription,
            is_deposit_product: p.is_deposit_product === true,
            deposit_prod_price_per_lb: p.deposit_prod_price_per_lb,
          };
        });


        // Generate categories
        const categories: Category[] = (catalogData.categories || []).map((categoryId, index) => ({
          id: categoryId,
          name: categoryId,
          description: `${categoryId} products`,
          imageUrl: '/demo-category.svg',
          sortOrder: index + 1,
        }));

        console.log('✅ Products loaded:', products.length);
        console.log('✅ Categories:', categories.length);

        const tenantDefaultOrderMode = (tenantPolicyData as any)?.storefront_default_order_mode
          ?? catalogData?.tenant?.storefront_default_order_mode
          ?? 'exact_package';

        setData({
          settings,
          products,
          categories,
          tenantDefaultOrderMode,
        });
      } catch (err) {
        console.error('Error loading storefront data:', err);
        console.error('Full error details:', {
          error: err,
          message: err instanceof Error ? err.message : 'Unknown error',
          tenantId,
          stack: err instanceof Error ? err.stack : undefined
        });
        
        // Don't fall back to mock data - show the actual error
        setError(`Failed to load storefront data: ${err instanceof Error ? err.message : 'Unknown error'}`);
        
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    if (tenantId) {
      loadData();
    } else {
      setLoading(false);
      setError('No tenant ID provided');
    }
  }, [tenantId]);

  return { data, loading, error };
}

