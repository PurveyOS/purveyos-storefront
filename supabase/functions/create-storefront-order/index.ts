import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OrderLine {
  productId: string
  productName: string
  qty: number
  unitPriceCents: number
  lineTotalCents: number
  binWeight?: number | null
  weightLbs?: number | null
  isPreOrder?: boolean
  pricePer?: string
  weightBinId?: string
}

interface OrderRequest {
  tenantId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  deliveryMethod: 'pickup' | 'delivery'
  deliveryAddress?: string
  deliveryNotes?: string
  paymentMethod: 'venmo' | 'zelle' | 'card' | 'cash'
  lines: OrderLine[]
  subtotalCents: number
  taxCents: number
  totalCents: number
  subscription?: {
    enabled: boolean
    cadence?: 'weekly' | 'biweekly' | 'monthly'
    startDate?: string
    isCsaBox?: boolean
    targetWeightLbs?: number
    productId?: string
    quantity?: number
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role key (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const orderRequest: OrderRequest = await req.json()
    console.log('Creating storefront order:', orderRequest)

    // Validate request
    if (!orderRequest.tenantId || !orderRequest.customerEmail || !orderRequest.lines.length) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Start a transaction by using multiple operations
    // 1. Create the order
    const orderId = crypto.randomUUID()
    
    // Build note field with delivery/payment info
    const noteParts = []
    if (orderRequest.deliveryMethod) {
      noteParts.push(`delivery: ${orderRequest.deliveryMethod}`)
    }
    if (orderRequest.deliveryAddress) {
      noteParts.push(`address: ${orderRequest.deliveryAddress}`)
    }
    if (orderRequest.paymentMethod) {
      noteParts.push(`payment: ${orderRequest.paymentMethod}`)
    }
    const note = noteParts.join(' | ')
    
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        id: orderId,
        tenant_id: orderRequest.tenantId,
        customer_name: orderRequest.customerName,
        customer_email: orderRequest.customerEmail,
        customer_phone: orderRequest.customerPhone,
        note: note || null,
        subtotal_cents: orderRequest.subtotalCents,
        tax_cents: orderRequest.taxCents,
        total_cents: orderRequest.totalCents,
        source: 'storefront',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (orderError) {
      console.error('Error creating order:', orderError)
      throw orderError
    }

    console.log('Order created:', order)

    // 2. Create order lines and decrement inventory
    for (const line of orderRequest.lines) {
      // Convert unitPriceCents to dollars for price_per field
      const pricePerDollars = line.unitPriceCents / 100

      // Insert order line
      const { error: lineError } = await supabaseAdmin
        .from('order_lines')
        .insert({
          id: crypto.randomUUID(),
          order_id: orderId,
          tenant_id: orderRequest.tenantId,
          product_id: line.productId,
          product_name: line.productName,
          quantity: line.qty,
          unit_price_cents: line.unitPriceCents,
          price_per: pricePerDollars,
          line_total_cents: line.lineTotalCents,
          bin_weight: line.binWeight ?? null,
          weight_lbs: line.weightLbs ?? null,
          is_pre_order: line.isPreOrder ?? false,
          created_at: new Date().toISOString(),
        })

      if (lineError) {
        console.error('Error creating order line:', lineError)
        throw lineError
      }

      // Fetch product to determine unit type (lb vs ea)
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('id, unit, qty')
        .eq('id', line.productId)
        .single()

      if (productError) {
        console.error('Error fetching product:', productError)
        throw productError
      }

      // Calculate quantity to deduct based on product unit
      let qtyToDeduct = 0
      if (product.unit === 'lb') {
        // Weight-based: use binWeight for pre-packaged bins, weightLbs for custom weight
        const weight = line.binWeight ?? line.weightLbs ?? 0
        if (weight > 0) {
          qtyToDeduct = weight * line.qty
        }
      } else {
        // Each-based: use quantity
        qtyToDeduct = line.qty
      }

      if (qtyToDeduct > 0) {
        // 1. Update legacy product.qty for compatibility
        const newProductQty = Math.max(0, (product.qty || 0) - qtyToDeduct)
        const { error: updateError } = await supabaseAdmin
          .from('products')
          .update({
            qty: newProductQty,
            updated_at: new Date().toISOString(),
          })
          .eq('id', line.productId)

        if (updateError) {
          console.error('Error updating product.qty:', updateError)
          throw updateError
        }

        // 2. Decrement package_bins (authoritative inventory)
        if (product.unit === 'lb') {
          // Weight-based: decrement specific weight bin
          // Use binWeight for pre-packaged bins, weightLbs for custom weight orders
          const weight = line.binWeight ?? line.weightLbs ?? 0
          const weightBtn = Math.round(weight * 100) / 100
          const packageKey = `${product.id}|${weightBtn.toFixed(2)}`

          console.log(`Looking up package_bin: ${packageKey}, binWeight=${line.binWeight}, weightLbs=${line.weightLbs}, qty=${line.qty}`)

          const { data: bin, error: binQueryError } = await supabaseAdmin
            .from('package_bins')
            .select('qty')
            .eq('package_key', packageKey)
            .single()

          if (binQueryError) {
            console.error(`Error querying package_bins for ${packageKey}:`, binQueryError)
          } else if (bin && bin.qty > 0) {
            const newBinQty = Math.max(0, bin.qty - line.qty)
            const { error: binUpdateError } = await supabaseAdmin
              .from('package_bins')
              .update({
                qty: newBinQty,
                updated_at: new Date().toISOString(),
              })
              .eq('package_key', packageKey)
            
            if (binUpdateError) {
              console.error('Error updating package_bins:', binUpdateError)
            } else {
              console.log(`✓ Updated package_bins ${packageKey}: ${bin.qty} -> ${newBinQty}`)
            }
          } else {
            console.log(`⚠ Skipping package_bins update for ${packageKey}: bin=${JSON.stringify(bin)}`)
          }
        } else {
          // Each-based: decrement EA bin (weightBtn = 0)
          const packageKey = `${product.id}|0.00`

          console.log(`Looking up package_bin (EA): ${packageKey}, qty=${line.qty}`)

          const { data: bin, error: binQueryError } = await supabaseAdmin
            .from('package_bins')
            .select('qty')
            .eq('package_key', packageKey)
            .single()

          if (binQueryError) {
            console.error(`Error querying package_bins for ${packageKey}:`, binQueryError)
          } else if (bin && bin.qty > 0) {
            const newBinQty = Math.max(0, bin.qty - line.qty)
            const { error: binUpdateError } = await supabaseAdmin
              .from('package_bins')
              .update({
                qty: newBinQty,
                updated_at: new Date().toISOString(),
              })
              .eq('package_key', packageKey)
            
            if (binUpdateError) {
              console.error('Error updating package_bins:', binUpdateError)
            } else {
              console.log(`✓ Updated package_bins ${packageKey}: ${bin.qty} -> ${newBinQty}`)
            }
          } else {
            console.log(`⚠ Skipping package_bins update for ${packageKey}: bin=${JSON.stringify(bin)}`)
          }
        }

        // 3. Create inventory_txns audit record
        const txnId = `order-${orderId}-${line.productId}-${Date.now()}`
        await supabaseAdmin
          .from('inventory_txns')
          .insert({
            id: txnId,
            product_id: line.productId,
            type: 'OUT',
            qty_lbs: qtyToDeduct,
            reason: 'storefront_order',
            meta_json: { orderId, customerEmail: orderRequest.customerEmail },
            tenant_id: orderRequest.tenantId,
            created_at: new Date().toISOString(),
          })

        console.log(`Decremented inventory for ${line.productName}: product.qty ${product.qty} -> ${newProductQty}, qtyLbs: ${qtyToDeduct}`)
      }
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        orderId: orderId,
        message: 'Order created successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Error in create-storefront-order function:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
