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
  order_mode?: 'exact_package' | 'pack_for_you' | null
  pack_for_you_min_lbs?: number | null
  pack_for_you_step_lbs?: number | null
  pack_for_you_max_overage_pct?: number | null
  pack_for_you_max_underage_pct?: number | null
  pack_for_you_price_buffer_pct?: number | null
  // Subscription fields
  isSubscription?: boolean
  subscriptionData?: {
    id: string
    price_per_interval: number
    interval_type: 'weekly' | 'biweekly' | 'monthly'
    duration_type: 'ongoing' | 'fixed_duration' | 'seasonal'
    season_start_date?: string
    season_end_date?: string
    min_interval?: number
    boxContents?: Array<{
      productId: string
      productName: string
      quantity: number
      unit: string
    }>
    substitutionGroups?: Array<{
      groupName: string
      allowedUnits: number
      options: Array<{
        productId: string
        productName: string
        requiredQuantity: number
        unit: string
        isOptional?: boolean
      }>
    }>
  }
}

export interface StorefrontCatalog {
  tenant: {
    id: string
    slug: string
    name: string
    storefront_default_order_mode?: 'exact_package' | 'pack_for_you'
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
    // Fetch products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, pricePer, unit, image, category, qty, description, allow_pre_order, is_deposit_product, deposit_prod_price_per_lb')
      .eq('tenant_id', tenantId)
      .eq('is_online', true)
      .order('name')

    if (productsError) {
      throw productsError
    }

    // Fetch subscription products
    const { data: subscriptionProducts, error: subscriptionError } = await supabase
      .from('subscription_products')
      .select('id, product_id, price_per_interval, interval_type, duration_type, season_start_date, season_end_date, min_interval')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    // Fetch subscription box items
    // Fetch ALL box items (both regular contents and substitution options)
    const { data: subscriptionBoxItems } = await supabase
      .from('subscription_box_items')
      .select('subscription_product_id, product_id, substitution_group, default_quantity, substitution_group_units_allowed, is_optional, is_substitution_option')
      .in('subscription_product_id', subscriptionProducts?.map((sp: any) => sp.id) || [])

    // Build subscription map
    const subscriptionMap = new Map()
    if (subscriptionProducts && !subscriptionError) {
      for (const sp of subscriptionProducts as any[]) {
        const boxItems = subscriptionBoxItems?.filter((item: any) => item.subscription_product_id === sp.id) || []
        
        // Separate regular box contents from substitution options
        const regularBoxContents = boxItems.filter((item: any) => !item.is_substitution_option)
        const substitutionOptions = boxItems.filter((item: any) => item.is_substitution_option && item.substitution_group)
        
        // Group substitution options by substitution_group
        const groupsMap = new Map()
        for (const item of substitutionOptions) {
          const groupName = item.substitution_group || 'default'
          if (!groupsMap.has(groupName)) {
            groupsMap.set(groupName, {
              groupName,
              allowedUnits: item.substitution_group_units_allowed || 1,
              options: []
            })
          }

          const itemProduct = products?.find((p: any) => p.id === item.product_id)
          if (itemProduct) {
            groupsMap.get(groupName).options.push({
              productId: item.product_id,
              productName: itemProduct.name,
              requiredQuantity: item.default_quantity || 1,
              unit: itemProduct.unit || 'ea',
              isOptional: item.is_optional || false
            })
          }
        }

        const substitutionGroups = Array.from(groupsMap.values()).filter(g => g.options.length > 0)

        // Build box contents array
        const boxContents = regularBoxContents.map((item: any) => {
          const itemProduct = products?.find((p: any) => p.id === item.product_id)
          return {
            productId: item.product_id,
            productName: itemProduct?.name || 'Unknown',
            quantity: item.default_quantity || 1,
            unit: itemProduct?.unit || 'ea'
          }
        }).filter(item => item.productId) // Only include items with valid product

        subscriptionMap.set(sp.product_id, {
          id: sp.id,
          price_per_interval: sp.price_per_interval,
          interval_type: sp.interval_type,
          duration_type: sp.duration_type,
          season_start_date: sp.season_start_date,
          season_end_date: sp.season_end_date,
          min_interval: sp.min_interval,
          boxContents, // Regular items that come with every box
          substitutionGroups: substitutionGroups.length > 0 ? substitutionGroups : undefined
        })
      }
    }

    // Enrich products with subscription data
    const enrichedProducts = products?.map((p: any) => {
      const subscriptionData = subscriptionMap.get(p.id)
      return {
        ...p,
        isSubscription: !!subscriptionData,
        subscriptionData: subscriptionData || undefined
      }
    }) || []

    return enrichedProducts
  } catch (error) {
    console.error('Error fetching products (fallback):', error)
    throw error
  }
}
