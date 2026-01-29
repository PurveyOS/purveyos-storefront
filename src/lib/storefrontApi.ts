// src/lib/storefrontApi.ts
// ============================================================================
// Storefront API Helper
// ============================================================================
// Purpose: Centralized API for public storefront browsing via Edge Function
// 
// Why Edge Function instead of direct RLS?
// 1) Avoids header injection issues with supabase-js
// 2) Validates tenant existence before returning products
// 3) Provides strong server-side tenant isolation
// 4) No expensive RLS subqueries = better performance
// 5) Single source of truth for catalog logic
// ============================================================================

import { supabase } from './supabaseClient'

export interface StorefrontProduct {
  id: string
  name: string
  pricePer: number
  unit: string
  image?: string
  category?: string
  qty?: number
  description?: string
  allow_pre_order?: boolean
  is_deposit_product?: boolean
  deposit_prod_price_per_lb?: number
}

export interface StorefrontCatalog {
  tenant: {
    id: string
    slug: string
    name: string
  }
  products: StorefrontProduct[]
  categories: string[]
  bins?: any[]
}

/**
 * Fetch storefront catalog (products + categories) for a tenant by slug
 * 
 * Uses Edge Function for:
 * - Tenant validation (ensures storefront_enabled = true)
 * - Secure product filtering
 * - No reliance on custom headers or complex RLS
 * 
 * @param slug - Tenant slug (e.g., "testfarmstore")
 * @param options - Optional flags (include_bins, include_categories)
 * @returns Catalog with products, categories, and tenant info
 * @throws Error if tenant not found or storefront disabled
 */
export async function fetchStorefrontCatalog(
  slug: string,
  options?: {
    includeBins?: boolean
    includeCategories?: boolean
  }
): Promise<StorefrontCatalog> {
  if (!slug) {
    throw new Error('Slug is required')
  }

  try {
    const params = new URLSearchParams({
      slug: slug.toLowerCase(),
      include_bins: options?.includeBins ? 'true' : 'false',
      include_categories: options?.includeCategories !== false ? 'true' : 'false',
    })

    // Call Edge Function
    const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = import.meta.env

    if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
      throw new Error('Supabase environment variables not configured')
    }

    const url = `${VITE_SUPABASE_URL}/functions/v1/storefront-products?${params.toString()}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${VITE_SUPABASE_ANON_KEY}`,
        'apikey': VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Storefront API error:', error)
      throw new Error(error.error || `Failed to fetch catalog: ${response.statusText}`)
    }

    const catalog: StorefrontCatalog = await response.json()

    console.log(`📦 Fetched storefront catalog for tenant: ${catalog.tenant.slug}`)
    console.log(`📦 Products: ${catalog.products.length}, Categories: ${catalog.categories.length}`)

    return catalog
  } catch (error) {
    console.error('Error fetching storefront catalog:', error)
    throw error
  }
}

/**
 * Fallback: Direct RLS query for products (only if Edge Function is unavailable)
 * 
 * WARNING: This bypasses the Edge Function's tenant validation.
 * Only use as fallback during Edge Function outage.
 * 
 * @param tenantId - Tenant UUID (must be verified by application)
 * @returns Products for the tenant
 */
export async function fetchStorefrontProductsDirectRLS(tenantId: string): Promise<StorefrontProduct[]> {
  console.warn('⚠️ Using direct RLS query for products (fallback)')

  try {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, pricePer, unit, image, category, qty, description, allow_pre_order, is_deposit_product, deposit_prod_price_per_lb')
      .eq('tenant_id', tenantId)
      .eq('is_online', true)
      .order('name')

    if (error) {
      throw error
    }

    return data || []
  } catch (error) {
    console.error('Error fetching products (fallback):', error)
    throw error
  }
}
