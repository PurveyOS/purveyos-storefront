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
  deliveryMethod: 'pickup' | 'delivery' | 'shipping' | 'dropoff' | 'other'
  deliveryAddress?: string
  deliveryNotes?: string
  fulfillmentLocation?: string
  paymentMethod: 'venmo' | 'zelle' | 'card' | 'cash'
  lines: OrderLine[]
  subtotalCents: number
  taxCents: number
  totalCents: number
  discountCents?: number
  shippingChargeCents?: number
  isWeightEstimate?: boolean
  estimatedTotalCents?: number
  subscription?: {
    enabled: boolean
    cadence?: 'weekly' | 'biweekly' | 'monthly'
    startDate?: string
    subscriptionProductId?: string  // used by purveyos-storefront
    productId?: string              // used by huckster-ui
    isCsaBox?: boolean              // huckster-ui specific
    targetWeightLbs?: number        // huckster-ui specific
    quantity?: number
  }
}

function buildPackageKey(productId: string, unit: string | null | undefined, line: OrderLine) {
  const isLb = (unit || '').toLowerCase() === 'lb'
  const rawWeight = isLb ? (line.binWeight ?? line.weightLbs ?? 0) : 0
  const weightBtn = Math.round(rawWeight * 100) / 100
  const weightStr = weightBtn.toString().replace(/\.0+$/, '').replace(/\.([1-9]*)0+$/, '.$1') || '0'
  return `${productId}|${weightStr}`
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

    // Get authenticated user ID from JWT if present
    let userId = null
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (!authError && user) {
          userId = user.id
          console.log('Order from authenticated user:', userId)
        }
      } catch (e) {
        console.log('Could not parse user from token:', e)
      }
    }

    const orderRequest: OrderRequest = await req.json()
    console.log('Creating storefront order:', orderRequest)
    console.log('🔍 Subscription payload received:', JSON.stringify(orderRequest.subscription, null, 2))

    // Validate request
    if (!orderRequest.tenantId || !orderRequest.customerEmail || !orderRequest.lines.length) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Derive weight-based pre-order flags (used to mark orders as estimates)
    const isWeightEstimate = orderRequest.isWeightEstimate ?? orderRequest.lines.some((line) => {
      const lineIsPreOrder = line.isPreOrder ?? false
      const hasWeight = (line.weightLbs ?? 0) > 0 || (line.binWeight ?? 0) > 0
      const isWeightPriced = line.pricePer === 'lb'
      return lineIsPreOrder && (hasWeight || isWeightPriced)
    })

    const estimatedTotalCents = orderRequest.estimatedTotalCents ?? (isWeightEstimate ? orderRequest.totalCents : null)

    // Preflight stock check to prevent orders on unavailable items
    const productIds = Array.from(new Set(orderRequest.lines.map((l) => l.productId)))

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, unit, qty')
      .eq('tenant_id', orderRequest.tenantId)
      .in('id', productIds)

    if (productsError) {
      console.error('Error fetching products for stock check:', productsError)
      return new Response(JSON.stringify({ error: 'Inventory check failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: bins, error: binsError } = await supabaseAdmin
      .from('package_bins')
      .select('product_id, package_key, qty, reserved_qty')
      .eq('tenant_id', orderRequest.tenantId)
      .in('product_id', productIds)

    if (binsError) {
      console.error('Error fetching package_bins for stock check:', binsError)
      return new Response(JSON.stringify({ error: 'Inventory check failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const productsById = new Map((products ?? []).map((p) => [p.id, p]))
    const binsByKey = new Map((bins ?? []).map((b) => [b.package_key, b]))

    const shortages: Array<{ productId: string; binWeight?: number | null; weightLbs?: number | null; available: number }> = []

    for (const line of orderRequest.lines) {
      const product = productsById.get(line.productId)
      const packageKey = buildPackageKey(line.productId, product?.unit, line)
      const bin = binsByKey.get(packageKey)
      const reserved = bin?.reserved_qty ?? 0
      const availableFromBin = bin ? Math.max(0, (bin.qty ?? 0) - reserved) : null
      const available = availableFromBin !== null ? availableFromBin : (product?.qty ?? 0)
      const required = line.qty ?? 1

      if (!bin && (product?.unit || '').toLowerCase() === 'lb') {
        shortages.push({ productId: line.productId, binWeight: line.binWeight, weightLbs: line.weightLbs, available: 0 })
        continue
      }

      if (required > available) {
        shortages.push({ productId: line.productId, binWeight: line.binWeight, weightLbs: line.weightLbs, available })
      }
    }

    if (shortages.length > 0) {
      console.warn('Blocking order: insufficient stock for lines', shortages)
      return new Response(JSON.stringify({ error: 'out_of_stock', shortages }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Start a transaction by using multiple operations
    // 1. Create the order
    const orderId = crypto.randomUUID()
    
    // Build note field with delivery/payment info
    const noteParts = []
    if (orderRequest.deliveryMethod) {
      noteParts.push(`fulfillment: ${orderRequest.deliveryMethod}`)
    }
    if (orderRequest.fulfillmentLocation) {
      noteParts.push(`location: ${orderRequest.fulfillmentLocation}`)
    }
    if (orderRequest.deliveryAddress) {
      noteParts.push(`address: ${orderRequest.deliveryAddress}`)
    }
    if (orderRequest.shippingChargeCents && orderRequest.shippingChargeCents > 0) {
      noteParts.push(`shipping charge: $${(orderRequest.shippingChargeCents / 100).toFixed(2)}`)
    }
    if (orderRequest.paymentMethod) {
      noteParts.push(`payment: ${orderRequest.paymentMethod}`)
    }
    if (orderRequest.deliveryNotes) {
      noteParts.push(`notes: ${orderRequest.deliveryNotes}`)
    }
    const note = noteParts.join(' | ')
    
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        id: orderId,
        tenant_id: orderRequest.tenantId,
        user_id: userId, // Link to authenticated user if logged in
        customer_name: orderRequest.customerName,
        customer_email: orderRequest.customerEmail,
        customer_phone: orderRequest.customerPhone,
        note: note || null,
        subtotal_cents: orderRequest.subtotalCents,
        tax_cents: orderRequest.taxCents,
        shipping_cents: orderRequest.shippingChargeCents ?? 0,
        total_cents: orderRequest.totalCents,
        discount_cents: orderRequest.discountCents ?? 0,
        is_weight_estimate: isWeightEstimate,
        estimated_total_cents: estimatedTotalCents,
        source: 'storefront',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    console.log('💳 [Edge] Order created with discount_cents:', orderRequest.discountCents ?? 0, 'Full order object:', {
      subtotal_cents: orderRequest.subtotalCents,
      discount_cents: orderRequest.discountCents ?? 0,
      tax_cents: orderRequest.taxCents,
      total_cents: orderRequest.totalCents,
    });

    if (orderError) {
      console.error('Error creating order:', orderError)
      throw orderError
    }

    console.log('Order created:', order)

    // Log discount usage if discount was applied
    if (orderRequest.discountCents && orderRequest.discountCents > 0) {
      console.log('📝 Creating discount_usage_log entry for order:', { orderId, discountCents: orderRequest.discountCents })
      
      // Find discount by matching the discount amount (heuristic - may need refinement)
      const { data: discounts } = await supabaseAdmin
        .from('tenant_discounts')
        .select('id')
        .eq('tenant_id', orderRequest.tenantId)
        .eq('is_active', true)
        .limit(1)
      
      const discountId = discounts?.[0]?.id || 'unknown-discount'
      
      const { error: usageError } = await supabaseAdmin
        .from('discount_usage_log')
        .insert({
          id: crypto.randomUUID(),
          discount_id: discountId,
          tenant_id: orderRequest.tenantId,
          order_id: orderId,
          customer_id: userId || null,
          discount_amount_applied: orderRequest.discountCents,
          created_at: new Date().toISOString(),
        })
      
      if (usageError) {
        console.warn('Error logging discount usage (non-blocking):', usageError)
        // Don't throw - discount logging is not critical to order creation
      } else {
        console.log('✓ Discount usage logged for order:', orderId)
      }
    }

    // 2. Create order lines and decrement inventory
    for (const line of orderRequest.lines) {
      // Convert unitPriceCents to dollars for price_per field
      const pricePerDollars = line.unitPriceCents / 100
      
      console.log('📦 Processing line:', {
        productName: line.productName,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        pricePerDollars,
        lineTotalCents: line.lineTotalCents,
        weightLbs: line.weightLbs,
        binWeight: line.binWeight,
        isPreOrder: line.isPreOrder
      })

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
          // Round to 2 decimals to match package_bins weight_btn precision
          const weightBtn = Math.round(weight * 100) / 100
          // Remove trailing zeros: 1.30 -> 1.3, 1.00 -> 1, 1.56 -> 1.56
          const weightStr = weightBtn.toString().replace(/\.?0+$/, '')
          const packageKey = `${product.id}|${weightStr}`

          console.log(`Looking up package_bin: ${packageKey}, binWeight=${line.binWeight}, weightLbs=${line.weightLbs}, qty=${line.qty}, raw weight=${weight}`)

          const { data: bin, error: binQueryError } = await supabaseAdmin
            .from('package_bins')
            .select('qty')
            .eq('package_key', packageKey)
            .maybeSingle()

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
          // Each-based: decrement EA bin (weightBtn = 0, not 0.00)
          const packageKey = `${product.id}|0`

          console.log(`Looking up package_bin (EA): ${packageKey}, qty=${line.qty}`)

          const { data: bin, error: binQueryError } = await supabaseAdmin
            .from('package_bins')
            .select('qty')
            .eq('package_key', packageKey)
            .maybeSingle()

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

    // 3. Create customer_subscription if subscription is enabled
    if (orderRequest.subscription?.enabled) {
      const sub = orderRequest.subscription
      console.log('Creating customer subscription:', JSON.stringify(sub, null, 2))
      
      if (!sub.subscriptionProductId) {
        console.error('⚠️ subscriptionProductId is missing from subscription payload!');
        console.error('Full subscription object:', sub);
      } else {
        // Calculate next delivery date based on cadence
        const startDate = sub.startDate ? new Date(sub.startDate) : new Date()
        const nextDeliveryDate = new Date(startDate)
        
        if (sub.cadence === 'weekly') {
          nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 7)
        } else if (sub.cadence === 'biweekly') {
          nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 14)
        } else if (sub.cadence === 'monthly') {
          nextDeliveryDate.setMonth(nextDeliveryDate.getMonth() + 1)
        }
        
        // Get subscription product details
        console.log(`Looking up subscription_product with id: ${sub.subscriptionProductId}`);
        const { data: subscriptionProduct, error: subProductError } = await supabaseAdmin
          .from('subscription_products')
          .select('*')
          .eq('id', sub.subscriptionProductId)
          .single()
        
        if (subProductError) {
          console.error('Error fetching subscription product:', subProductError)
          console.error('Query was for subscription_product_id:', sub.subscriptionProductId);
          // Don't fail the order, but log it
        } else if (!subscriptionProduct) {
          console.error('⚠️ No subscription_product found with id:', sub.subscriptionProductId);
        } else {
          console.log('✓ Found subscription product:', subscriptionProduct.name);
          
          const subscriptionRecord = {
            id: crypto.randomUUID(),
            tenant_id: orderRequest.tenantId,
            subscription_product_id: sub.subscriptionProductId!,
            user_id: userId, // Link to authenticated user for customer portal
            customer_name: orderRequest.customerName,
            customer_email: orderRequest.customerEmail,
            customer_phone: orderRequest.customerPhone || null,
            status: 'active',
            start_date: startDate.toISOString().split('T')[0], // DATE field, not TIMESTAMPTZ
            next_delivery_date: nextDeliveryDate.toISOString().split('T')[0], // DATE field
            price_per_interval: subscriptionProduct.price_per_interval,
            interval_type: sub.cadence!,
            interval_count: subscriptionProduct.interval_count || 1,
            total_deliveries_expected: subscriptionProduct.duration_type === 'fixed_duration' 
              ? subscriptionProduct.duration_intervals 
              : null,
            end_date: subscriptionProduct.duration_type === 'seasonal' && subscriptionProduct.season_end_date
              ? subscriptionProduct.season_end_date
              : null,
            deliveries_fulfilled: 1, // This first order counts as delivery #1
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          
          console.log('Inserting customer_subscription:', JSON.stringify(subscriptionRecord, null, 2));
          
          // Create customer_subscription record
          const { error: subscriptionError } = await supabaseAdmin
            .from('customer_subscriptions')
            .insert(subscriptionRecord)
          
          if (subscriptionError) {
            console.error('❌ Error creating customer subscription:', subscriptionError)
            console.error('Error details:', JSON.stringify(subscriptionError, null, 2));
            // Don't fail the order, but log it
          } else {
            console.log('✓ Customer subscription created successfully with id:', subscriptionRecord.id)
          }
        }
      }
    }

    // Send confirmation email to customer (non-blocking, don't fail order if notification fails)
    try {
      if (orderRequest.customerEmail) {
        console.log('📧 Sending order confirmation email to customer:', orderRequest.customerEmail);
        const notifyResult = await supabaseAdmin.functions.invoke('order-notify', {
          body: {
            orderId,
            emailType: 'order_confirmation',
            triggerSource: 'storefront'
          }
        });
        console.log('✓ Order confirmation notification result:', notifyResult);
        if (notifyResult.error) {
          console.error('⚠️ order-notify returned error (non-fatal):', notifyResult.error);
        } else {
          console.log('✓ Confirmation email sent successfully');
        }
      }
    } catch (notifyError) {
      console.error('⚠️ Failed to send confirmation email (non-fatal):', notifyError);
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
