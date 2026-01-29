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

  try {
    // Parse request
    const url = new URL(req.url)
    const slug = url.searchParams.get('slug')?.toLowerCase()
    const includeBins = url.searchParams.get('include_bins') === 'true'
    const includeCategories = url.searchParams.get('include_categories') !== 'false' // default true

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
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, slug, name, storefront_enabled, is_active')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

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
    // STEP 2: Fetch products for tenant
    // ============================================================================
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, pricePer, unit, image, category, qty, description, allow_pre_order, is_deposit_product, deposit_prod_price_per_lb')
      .eq('tenant_id', tenant.id)
      .eq('is_online', true)
      .order('name')

    if (productsError) {
      console.error('Products fetch error:', productsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch products' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============================================================================
    // STEP 3: Generate categories from products
    // ============================================================================
    const categories = includeCategories
      ? Array.from(new Set(products?.map(p => p.category).filter(Boolean) as string[]))
      : []

    // ============================================================================
    // STEP 4: Optionally fetch package bins
    // ============================================================================
    let bins = []
    if (includeBins) {
      const { data: binsData, error: binsError } = await supabase
        .from('package_bins')
        .select('product_id, weight_btn, unit_price_cents, qty, reserved_qty')
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
      },
      products: products || [],
      categories,
      bins: includeBins ? bins : [],
    }

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
