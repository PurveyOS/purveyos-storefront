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
        
  const [settingsResult, productsResult, binsResult] = await Promise.all([
          supabase
            .from('storefront_settings')
            .select('*')
            .eq('tenant_id', tenantId)
            .single(),
          
          supabase
            .from('products')
            .select('id, name, pricePer, unit, image, category, qty, online_description')
            .eq('tenant_id', tenantId)
            .eq('is_online', true)
            .order('name'),
          
          supabase
            .from('package_bins')
            .select('product_id, weight_btn, unit_price_cents, qty')
            .gt('qty', 0) // Only show bins with inventory
        ]);

        console.log('Settings result:', settingsResult);
        console.log('Products result:', productsResult);
  console.log('Bins result:', binsResult);

        // Check for errors
        if (settingsResult.error) {
          console.error('Settings error:', settingsResult.error);
          throw settingsResult.error;
        }
        if (productsResult.error) {
          console.error('Products error:', productsResult.error);
          throw productsResult.error;
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
        const binsByProduct = new Map<string, Array<{ weightBtn: number; unitPriceCents: number; qty: number }>>();
        if (binsResult.data) {
          binsResult.data.forEach((bin: any) => {
            if (!binsByProduct.has(bin.product_id)) {
              binsByProduct.set(bin.product_id, []);
            }
            binsByProduct.get(bin.product_id)!.push({
              weightBtn: bin.weight_btn,
              unitPriceCents: bin.unit_price_cents,
              qty: bin.qty,
            });
          });
        }

        const products: Product[] = productsResult.data.map(p => ({
          id: p.id,
          name: p.name,
          description: p.online_description || '', // Use online_description column
          pricePer: p.pricePer || 0,
          unit: p.unit || 'lb',
          weightBins: binsByProduct.get(p.id),
          imageUrl: p.image || '/demo-product.svg', // Use image column
          categoryId: p.category || '', // Use category column
          available: true,
          inventory: p.qty || 0,
        }));

        // Since we don't have category column yet, create a generic "Products" category
        const categories: Category[] = products.length > 0 ? [{
          id: 'all',
          name: 'All Products',
          description: 'All available products',
          imageUrl: '/demo-category.svg',
          sortOrder: 1,
        }] : [];

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

        const enableMockFallback = (import.meta as any).env?.VITE_ENABLE_MOCK_FALLBACK === 'true';
        if (enableMockFallback) {
          console.log('🛟 VITE_ENABLE_MOCK_FALLBACK enabled — serving mock data instead of failing');
          setData({
            settings: MOCK_SETTINGS,
            products: MOCK_PRODUCTS,
            categories: MOCK_CATEGORIES,
          });
          setError(null);
        } else {
          setError(`Failed to load storefront data: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setData(null);
        }
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