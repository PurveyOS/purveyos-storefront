import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
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
          });
          return;
        }

        // Fetch real data from Supabase
        console.log('Fetching data for tenant:', tenantId);
        
  const [settingsResult, productsResult, binsResult, subscriptionsResult] = await Promise.all([
          supabase
            .from('storefront_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .single(),
          
          supabase
            .from('products')
            .select('id, name, pricePer, unit, image, category, qty, online_description, allow_pre_order, is_deposit_product, deposit_prod_price_per_lb')
            .eq('tenant_id', tenantId)
            .eq('is_online', true)
            .order('name'),
          
          supabase
            .from('package_bins')
            .select('product_id, weight_btn, unit_price_cents, qty, reserved_qty')
            .eq('tenant_id', tenantId)
            .gt('qty', 0), // Only show bins with inventory
          
          supabase
            .from('subscription_products')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
        ]);

        // Debug subscription fetch
        if (subscriptionsResult.error) {
          console.error('❌ Error fetching subscription_products:', subscriptionsResult.error);
        }
        console.log('🔍 Subscription query filter:', { tenant_id: tenantId, is_active: true });
        console.log('📦 Raw subscription result:', subscriptionsResult);
        
        // Try fetching ALL subscriptions without filters to debug
        const { data: allSubs, error: allSubsError } = await supabase
          .from('subscription_products')
          .select('*');
        console.log('🌐 ALL subscription_products (no filter):', allSubs?.length || 0, allSubs);
        if (allSubsError) {
          console.error('❌ Error fetching ALL subscriptions:', allSubsError);
        }

        console.log('Settings result:', settingsResult);
        console.log('Products result:', productsResult);
  console.log('Bins result:', binsResult);

        // Check for errors
        if (settingsResult.error) {
          console.error('Settings error:', settingsResult.error);
          throw settingsResult.error;
        }
        // Handle missing column fallback (e.g., allow_pre_order not present)
        let productsRows: any[] | null = null;
        if (productsResult.error) {
          console.error('Products error:', productsResult.error);
          if ((productsResult.error as any).code === '42703') {
            // Retry without the optional column to avoid breaking the site
            console.warn('Retrying products query without allow_pre_order column');
            const retryProducts = await supabase
              .from('products')
              .select('id, name, pricePer, unit, image, category, qty, online_description')
              .eq('tenant_id', tenantId)
              .eq('is_online', true)
              .order('name');
            if (retryProducts.error) {
              console.error('Products retry error:', retryProducts.error);
              throw retryProducts.error;
            }
            productsRows = retryProducts.data ?? [];
          } else {
            throw productsResult.error;
          }
        } else {
          productsRows = productsResult.data ?? [];
        }

        // Transform the data to match our interfaces
        const settings = settingsResult.data ? {
          templateId: settingsResult.data.template_id || "modern",
          primaryColor: settingsResult.data.primary_color || "#0f6fff",
          accentColor: settingsResult.data.accent_color || "#ffcc00",
          logoUrl: settingsResult.data.logo_url || "/demo-logo.svg",
          heroImageUrl: settingsResult.data.hero_image_url || "/demo-hero.svg",
          heroHeading: settingsResult.data.hero_heading || "Farm Fresh Goodness",
          heroSubtitle: settingsResult.data.hero_subtitle || "From our pasture to your table.",
          farmName: settingsResult.data.farm_name || "Demo Farm",
          farmDescription: settingsResult.data.farm_description,
          contactEmail: settingsResult.data.contact_email,
          contactPhone: settingsResult.data.contact_phone,
          darkMode: settingsResult.data.enable_dark_mode || false,
          allow_pickup: settingsResult.data.allow_pickup ?? false,
          allow_shipping: settingsResult.data.allow_shipping ?? true,
          allow_dropoff: settingsResult.data.allow_dropoff ?? false,
          allow_other: settingsResult.data.allow_other ?? false,
          enable_card: settingsResult.data.enable_card
            ?? settingsResult.data.allow_card
            ?? settingsResult.data.accept_card
            ?? false,
          allow_card: settingsResult.data.allow_card
            ?? settingsResult.data.enable_card
            ?? settingsResult.data.accept_card
            ?? false,
          shipping_charge_cents: settingsResult.data.shipping_charge_cents ?? 0,
          pickup_locations: Array.isArray(settingsResult.data.pickup_locations)
            ? settingsResult.data.pickup_locations
            : [],
          dropoff_locations: Array.isArray(settingsResult.data.dropoff_locations)
            ? settingsResult.data.dropoff_locations.map((loc: any) => ({
                name: loc?.name || '',
                address: loc?.address || '',
                day: loc?.day || '',
                time: loc?.time || '',
              }))
            : [],
          featureSections: Array.isArray(settingsResult.data.feature_sections)
            ? settingsResult.data.feature_sections.map((s: any) => ({
                imageUrl: s.image_url,
                heading: s.heading,
                subtitle: s.subtitle,
                ctaText: s.cta_text,
                ctaLink: s.cta_link,
              }))
            : []
        } : MOCK_SETTINGS;

        // Group bins by product_id
        const binsByProduct = new Map<string, Array<{ weightBtn: number; unitPriceCents: number; qty: number; reservedQty?: number }>>();
        if (binsResult.data) {
          binsResult.data.forEach((bin: any) => {
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

        // Group subscriptions by product_id
        const subscriptionsByProduct = new Map<string, any>();
        console.log('📊 Subscription products fetched:', subscriptionsResult.data?.length || 0);
        console.log('📊 Raw subscription data:', JSON.stringify(subscriptionsResult.data, null, 2));
        if (subscriptionsResult.data) {
          subscriptionsResult.data.forEach((sub: any) => {
            console.log('🔗 Mapping subscription product_id:', sub.product_id, '-> subscription_id:', sub.id);
            subscriptionsByProduct.set(sub.product_id, {
              id: sub.id,
              price_per_interval: sub.price_per_interval,
              interval_type: sub.interval_type,
              duration_type: sub.duration_type,
              season_start_date: sub.season_start_date,
              season_end_date: sub.season_end_date,
            });
          });
        }
        console.log('📦 Subscriptions by product map size:', subscriptionsByProduct.size);
        console.log('📦 Subscription product IDs:', Array.from(subscriptionsByProduct.keys()));

        const products: Product[] = (productsRows || []).map(p => {
          const bins = binsByProduct.get(p.id);
          const subscription = subscriptionsByProduct.get(p.id);
          
          console.log('🔍 Processing product:', p.id, p.name);
          console.log('   Has subscription data?', !!subscription);
          console.log('   is_deposit_product from DB:', p.is_deposit_product);
          if (subscription) {
            console.log('   ✅ Subscription data:', JSON.stringify(subscription, null, 2));
          }
          
          // Calculate total inventory from package_bins (authoritative source)
          const totalInventory = bins 
            ? bins.reduce((sum, bin) => sum + ((bin.qty - (bin.reserved_qty || 0)) || 0), 0)
            : 0;
          
          const productData = {
            id: p.id,
            name: p.name,
            description: p.online_description || '', // Use online_description column
            pricePer: subscription ? subscription.price_per_interval : (p.pricePer || 0), // Use subscription price if available
            unit: p.unit || 'lb',
            weightBins: bins,
            imageUrl: p.image || '/demo-product.svg', // Use image column
            categoryId: p.category || '', // Use category column
            available: true,
            inventory: totalInventory,
            allowPreOrder: p.allow_pre_order === true,
            isSubscription: !!subscription,
            subscriptionData: subscription,
            is_deposit_product: p.is_deposit_product === true,
            deposit_prod_price_per_lb: p.deposit_prod_price_per_lb,
          };

          
          if (subscription) {
            console.log('   📦 Final product with subscription:', {
              id: productData.id,
              name: productData.name,
              isSubscription: productData.isSubscription,
              subscriptionData: productData.subscriptionData
            });
          }
          
          return productData;
        });

        // Generate categories from unique product categories
        const uniqueCategoryIds = Array.from(new Set(products.map(p => p.categoryId).filter(Boolean))) as string[];
        const categories: Category[] = uniqueCategoryIds.map((categoryId, index) => ({
          id: categoryId,
          name: categoryId, // Use category ID as the display name
          description: `${categoryId} products`,
          imageUrl: '/demo-category.svg',
          sortOrder: index + 1,
        }));

        console.log('Generated categories from products:', categories);
        console.log('Products loaded:', products.length);

        setData({
          settings,
          products,
          categories,
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

