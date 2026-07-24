import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface StorefrontRequest {
  slug: string
  include_bins?: boolean
  include_categories?: boolean
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    // Parse request
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')?.toLowerCase()
    const includeBins = url.searchParams.get('include_bins') === 'true'
    const includeCategories = url.searchParams.get('include_categories') !== 'false' // default true

    console.log(`[storefront-products] Starting request for slug: ${slug}`)

    if (!slug) {
      return new Response(
        JSON.stringify({ error: 'Missing slug parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create service role client for secure tenant lookup
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ============================================================================
    // STEP 1: Validate tenant by slug
    // ============================================================================
    const tenantLookupStart = Date.now()
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, slug, name, storefront_enabled, is_active, storefront_default_order_mode')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    const tenantLookupTime = Date.now() - tenantLookupStart
    console.log(`[storefront-products] Tenant lookup took ${tenantLookupTime}ms`)

    if (tenantError || !tenant) {
      console.error('Tenant lookup error:', tenantError)
      return new Response(
        JSON.stringify({ error: 'Tenant not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if storefront is enabled for this tenant
    if (!tenant.storefront_enabled) {
      return new Response(
        JSON.stringify({ error: 'Storefront not enabled for this tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============================================================================
    // STEP 2: Fetch products for tenant (excludes base64 image, uses image_url)
    // ============================================================================
    const productsFetchStart = Date.now()
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, pricePer, unit, variant_size, variant_unit, image_url, category, qty, description, allow_pre_order, is_deposit_product, deposit_prod_price_per_lb, deposit_fixed_total, order_mode, pack_for_you_min_lbs, pack_for_you_step_lbs, pack_for_you_max_overage_pct, pack_for_you_max_underage_pct, pack_for_you_price_buffer_pct, reserved_weight_lbs', { count: 'exact' })
      .eq('tenant_id', tenant.id)
      .eq('is_online', true)
      .limit(500)  // Prevent massive responses
      .order('name')

    const productsFetchTime = Date.now() - productsFetchStart
    console.log(`[storefront-products] Products fetch took ${productsFetchTime}ms (found ${products?.length || 0} products)`)

    if (productsError) {
      console.error('Products fetch error:', productsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch products' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const productIds = (products ?? []).map((product) => product.id).filter(Boolean)
    const activeDemandByProduct = new Map<string, { qty: number; lbs: number }>()

    if (productIds.length > 0) {
      const { data: activeOrders, error: activeOrdersError } = await supabase
        .from('orders')
        .select('order_lines(product_id, quantity, weight_lbs, bin_weight, requested_weight_lbs, is_pre_order, line_type)')
        .eq('tenant_id', tenant.id)
        .in('status', ['pending', 'ready'])

      if (activeOrdersError) {
        console.warn('[storefront-products] Active order demand fetch warning:', activeOrdersError.message)
      } else {
        for (const order of activeOrders ?? []) {
          for (const line of order.order_lines ?? []) {
            const productId = String(line.product_id ?? '').trim()
            if (!productId || line.is_pre_order === true) continue

            const quantity = Math.max(0, Number(line.quantity ?? 0))
            const requestedWeightLbs = Number(line.requested_weight_lbs ?? 0)
            const weightLbs = Number(line.weight_lbs ?? 0)
            const binWeight = Number(line.bin_weight ?? 0)
            const lbs = line.line_type === 'pack_for_you'
              ? 0
              : requestedWeightLbs > 0
                ? requestedWeightLbs * quantity
                : weightLbs > 0
                  ? weightLbs
                  : binWeight > 0
                    ? binWeight * quantity
                    : 0

            const current = activeDemandByProduct.get(productId) ?? { qty: 0, lbs: 0 }
            activeDemandByProduct.set(productId, {
              qty: current.qty + quantity,
              lbs: current.lbs + lbs,
            })
          }
        }
      }
    }

    // ============================================================================
    // STEP 2.5: Fetch subscription data for products
    // ============================================================================
    const subscriptionFetchStart = Date.now()
    const { data: subscriptionProducts, error: subscriptionError } = await supabase
      .from('subscription_products')
      .select('id, product_id, price_per_interval, interval_type, duration_type, season_start_date, season_end_date, min_interval')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)

    const subscriptionFetchTime = Date.now() - subscriptionFetchStart
    console.log(`[storefront-products] Subscription fetch took ${subscriptionFetchTime}ms (found ${subscriptionProducts?.length || 0} subscriptions)`)

    // Fetch subscription box items for building substitutionGroups
    // Only fetch items that are actual substitution options (excludes regular box items)
    const { data: subscriptionBoxItems, error: boxItemsError } = await supabase
      .from('subscription_box_items')
      .select('subscription_product_id, product_id, substitution_group, default_quantity, substitution_group_units_allowed, is_optional')
      .in('subscription_product_id', subscriptionProducts?.map(sp => sp.id) || [])
      .eq('is_substitution_option', true)
      .not('substitution_group', 'is', null)

    console.log(`[storefront-products] Found ${subscriptionBoxItems?.length || 0} subscription box items`)

    // Build subscription map with substitutionGroups
    const subscriptionMap = new Map()
    if (subscriptionProducts && !subscriptionError) {
      for (const sp of subscriptionProducts) {
        // Get all box items for this subscription
        const boxItems = subscriptionBoxItems?.filter(item => item.subscription_product_id === sp.id) || []
        
        // Group by substitution_group to build substitutionGroups array
        const groupsMap = new Map()
        for (const item of boxItems) {
          const groupName = item.substitution_group || 'default'
          if (!groupsMap.has(groupName)) {
            groupsMap.set(groupName, {
              groupName,
              allowedUnits: item.substitution_group_units_allowed || 1,
              options: []
            })
          }

          // Find product name for this box item
          const itemProduct = products?.find(p => p.id === item.product_id)
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

        subscriptionMap.set(sp.product_id, {
          id: sp.id,
          price_per_interval: sp.price_per_interval,
          interval_type: sp.interval_type,
          duration_type: sp.duration_type,
          season_start_date: sp.season_start_date,
          season_end_date: sp.season_end_date,
          min_interval: sp.min_interval,
          substitutionGroups: substitutionGroups.length > 0 ? substitutionGroups : undefined
        })
      }
    }

    // Enrich products with subscription data
    const enrichedProducts = products?.map(p => {
      const subscriptionData = subscriptionMap.get(p.id)
      const activeDemand = activeDemandByProduct.get(p.id) ?? { qty: 0, lbs: 0 }
      return {
        ...p,
        active_order_reserved_qty: activeDemand.qty,
        active_order_reserved_lbs: activeDemand.lbs,
        isSubscription: !!subscriptionData,
        subscriptionData: subscriptionData || undefined
      }
    }) || []

    // ============================================================================
    // STEP 3: Generate categories from products
    // ============================================================================
    const categories = includeCategories
      ? Array.from(new Set(enrichedProducts?.map(p => p.category).filter(Boolean) as string[]))
      : []

    // ============================================================================
    // STEP 4: Optionally fetch package bins
    // ============================================================================
    let bins = []
    if (includeBins) {
      const { data: binsData, error: binsError } = await supabase
        .from('package_bins')
        .select('product_id, weight_btn, unit_price_cents, qty, reserved_qty, reserved_lbs, bin_kind, qty_lbs')
        .eq('tenant_id', tenant.id)

      if (!binsError && binsData) {
        bins = binsData
      }
    }

    // ============================================================================
    // STEP 5: Return response
    // ============================================================================
    const response = {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        storefront_default_order_mode: tenant.storefront_default_order_mode || 'exact_package',
      },
      products: enrichedProducts,
      categories,
      bins: includeBins ? bins : [],
    }

    const totalTime = Date.now() - startTime
    console.log(`[storefront-products] Total request time: ${totalTime}ms`)

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
