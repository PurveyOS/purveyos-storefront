// @ts-ignore: Deno deploy provides these remote modules at runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore: Deno deploy provides these remote modules at runtime
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Minimal Deno env typing for TypeScript tooling
declare const Deno: { env: { get(key: string): string | undefined } }

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
  fulfillmentBucket?: 'NOW' | 'LATER'
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
  stripePaymentIntentId?: string  // Stripe payment intent ID for idempotency
  subscription?: {
    enabled: boolean
    cadence?: 'weekly' | 'biweekly' | 'monthly'
    startDate?: string
    subscriptionProductId?: string  // used by purveyos-storefront
    productId?: string              // used by huckster-ui
    isCsaBox?: boolean              // huckster-ui specific
    targetWeightLbs?: number        // huckster-ui specific
    quantity?: number
    duration?: number  // total deliveries expected
    substitutions?: Record<string, any>  // customer group choices
  }
}

function buildPackageKey(productId: string, unit: string | null | undefined, line: OrderLine) {
  const isLb = (unit || '').toLowerCase() === 'lb'
  const rawWeight = isLb ? (line.binWeight ?? line.weightLbs ?? 0) : 0
  const weightBtn = Math.round(rawWeight * 100) / 100
  const weightStr = weightBtn.toString().replace(/\.0+$/, '').replace(/\.([1-9]*)0+$/, '.$1') || '0'
  return `${productId}|${weightStr}`
}

serve(async (req: Request) => {
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

    // IDEMPOTENCY CHECK: Use stripe_payment_intent_id as stable key
    if (orderRequest.stripePaymentIntentId) {
      const { data: existingOrder, error: checkError } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('tenant_id', orderRequest.tenantId)
        .eq('stripe_payment_intent_id', orderRequest.stripePaymentIntentId)
        .maybeSingle()

      if (existingOrder) {
        console.log('✅ Idempotent request detected, returning existing order:', existingOrder.id)
        return new Response(
          JSON.stringify({ orderId: existingOrder.id, success: true, idempotent: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
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

    type ProductRow = { id: string; unit?: string | null; qty?: number | null; allow_pre_order?: boolean | null; pricing_mode?: string | null }
    type PackageBinRow = { package_key: string; qty?: number | null; reserved_qty?: number | null }

    const productsById = new Map<string, ProductRow>((products ?? []).map((p: ProductRow) => [p.id, p]))
    const binsByKey = new Map<string, PackageBinRow>((bins ?? []).map((b: PackageBinRow) => [b.package_key, b]))

    const shortages: Array<{ productId: string; binWeight?: number | null; weightLbs?: number | null; available: number }> = []

    for (const line of orderRequest.lines) {
      // Skip inventory check for pre-order items
      if (line.isPreOrder) {
        console.log('Skipping inventory check for pre-order item:', line.productId)
        continue
      }

      const productRow = productsById.get(line.productId)
      const packageKey = buildPackageKey(line.productId, productRow?.unit, line)
      const bin = binsByKey.get(packageKey)
      const reserved = bin?.reserved_qty ?? 0
      const availableFromBin = bin ? Math.max(0, (bin.qty ?? 0) - reserved) : null
      const available = availableFromBin !== null ? availableFromBin : (productRow?.qty ?? 0)
      const required = line.qty ?? 1

      if (!bin && (productRow?.unit || '').toLowerCase() === 'lb') {
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
        total: (orderRequest.totalCents / 100).toFixed(2),
        discount_cents: orderRequest.discountCents ?? 0,
        payment_method: orderRequest.paymentMethod,
        is_weight_estimate: isWeightEstimate,
        estimated_total_cents: estimatedTotalCents,
        is_subscription_order: orderRequest.subscription?.enabled ?? false,
        source: 'storefront',
        status: 'pending',
        payment_status: orderRequest.stripePaymentIntentId ? 'paid' : 'pending',
        stripe_payment_intent_id: orderRequest.stripePaymentIntentId || null,
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

      // Build package_key for bin-based items (LB products)
      const product = productsById.get(line.productId)
      const packageKey = buildPackageKey(line.productId, product?.unit, line)

      // Cash-like payments should reserve inventory instead of decrementing immediately
      const shouldReserve = !line.isPreOrder
        && ['cash', 'venmo', 'zelle'].includes(orderRequest.paymentMethod)
        && !orderRequest.stripePaymentIntentId

      // Selected bins payload (used for reservation and order_lines.selected_bins)
      const selectedBinsPayload = line.isPreOrder
        ? null
        : [{
            package_key: packageKey,
            qty: line.qty,
            weight_btn: line.binWeight ?? line.weightLbs ?? 0,
          }]

      // Reserve bins for cash-like payments
      let reservedAt: string | null = null
      let reservationExpiresAt: string | null = null
      if (shouldReserve && selectedBinsPayload) {
        const { data: reserveData, error: reserveError } = await supabaseAdmin.rpc('reserve_selected_bins', {
          p_tenant_id: orderRequest.tenantId,
          p_selected_bins: selectedBinsPayload,
          p_expiration_minutes: null  // NULL = no expiration for storefront orders (customer may pick up days later)
        })

        if (reserveError) {
          console.error('Error reserving bins for storefront order:', reserveError)
          throw reserveError
        }

        reservedAt = reserveData?.reserved_at ?? new Date().toISOString()
        reservationExpiresAt = reserveData?.reservation_expires_at ?? null
        console.log('✅ Reserved bins for cash-like payment (no expiration):', { packageKey, reservedAt, reservationExpiresAt })
      }

      // Insert order line with reservation metadata (if any)
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
          fulfillment_bucket: line.isPreOrder ? 'LATER' : 'NOW',
          selected_bins: selectedBinsPayload,
          reserved_at: reservedAt,
          reservation_expires_at: reservationExpiresAt,
          created_at: new Date().toISOString(),
        })

      if (lineError) {
        console.error('Error creating order line:', lineError)
        throw lineError
      }

      // Skip inventory reservation for pre-order items; they should fulfill later
      if (line.isPreOrder) {
        console.log(`Skipping inventory decrement for pre-order line ${line.productName}`)
        continue
      }

      // If we already reserved (cash-like payments), do not decrement inventory now
      if (shouldReserve) {
        console.log(`Reserved (no decrement) for cash-like payment on ${line.productName}`)
        continue
      }

      // Fetch product to determine unit type (lb vs ea)
      const { data: fetchedProduct, error: productError } = await supabaseAdmin
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
      if (fetchedProduct.unit === 'lb') {
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
        const newProductQty = Math.max(0, (fetchedProduct.qty || 0) - qtyToDeduct)
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
        if (fetchedProduct.unit === 'lb') {
          // Weight-based: decrement specific weight bin
          // Use binWeight for pre-packaged bins, weightLbs for custom weight orders
          const weight = line.binWeight ?? line.weightLbs ?? 0
          // Round to 2 decimals to match package_bins weight_btn precision
          const weightBtn = Math.round(weight * 100) / 100
          // Remove trailing zeros: 1.30 -> 1.3, 1.00 -> 1, 1.56 -> 1.56
          const weightStr = weightBtn.toString().replace(/\.?0+$/, '')
          const packageKey = `${fetchedProduct.id}|${weightStr}`

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
          const packageKey = `${fetchedProduct.id}|0`

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

        console.log(`Decremented inventory for ${line.productName}: product.qty ${fetchedProduct.qty} -> ${newProductQty}, qtyLbs: ${qtyToDeduct}`)
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
            user_id: userId, // Link to authenticated user for portal access
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
            deliveries_fulfilled: 0,  // Changed from 1 to 0 (not fulfilled yet, just ordered)
            payment_status: orderRequest.stripePaymentIntentId ? 'paid' : 'pending',
            total_paid_cents: orderRequest.stripePaymentIntentId ? orderRequest.totalCents : 0,
            stripe_payment_intent_id: orderRequest.stripePaymentIntentId || null,  // Link for idempotency + tracking
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
            
            // ===== NEW: Create subscription_deliveries =====
            try {
              const deliveryId = crypto.randomUUID()
              const startDateStr = startDate.toISOString().split('T')[0]
              
              console.log('🎁 [Subscription Setup] Fetching box items for subscription product:', sub.subscriptionProductId)
              // Fetch box items for the subscription product
              const { data: boxItems, error: boxItemsError } = await supabaseAdmin
                .from('subscription_box_items')
                .select(
                  'id, product_id, substitution_group, substitution_group_units_allowed, is_optional, is_substitution_option, display_order, default_quantity'
                )
                .eq('subscription_product_id', sub.subscriptionProductId)
                .order('display_order', { ascending: true })
              
              console.log('🎁 [Subscription Setup] Box items query result:', { boxItemsError, boxItemsCount: boxItems?.length })
              
              if (boxItemsError) {
                console.error('❌ [Subscription Setup] Could not fetch subscription box template:', boxItemsError)
              } else if (!boxItems || boxItems.length === 0) {
                console.warn('⚠️ [Subscription Setup] No box items found for subscription product')
              } else {
                console.log('✓ [Subscription Setup] Found', boxItems.length, 'box items:', boxItems.map((b: any) => ({ id: b.id, product_id: b.product_id, group: b.substitution_group })))
                // Build custom_items snapshot (JSONB object, not stringified)
                const choices = buildChoicesFromRequest(orderRequest, boxItems)
                console.log('🎁 [Subscription Setup] Built choices:', choices)
                
                const customItems = {
                  snapshot: {
                    client_generated_id: crypto.randomUUID(),
                    subscription_product_id: sub.subscriptionProductId,
                    subscription_product_name: subscriptionProduct.name,
                    choices: choices,
                  },
                  components: boxItems.map((item: any) => ({
                    subscription_box_item_id: item.id,
                    product_id: item.product_id,
                    substitution_group: item.substitution_group,
                    group_units_allowed: item.substitution_group_units_allowed,
                    is_optional: item.is_optional,
                    default_quantity: item.default_quantity,
                  })),
                }
                
                // Create subscription_deliveries (order_id = orders.id, UUID to UUID FK)
                const { error: deliveryError } = await supabaseAdmin
                  .from('subscription_deliveries')
                  .insert({
                    id: deliveryId,
                    tenant_id: orderRequest.tenantId,
                    customer_subscription_id: subscriptionRecord.id,
                    order_id: orderId,  // UUID link to orders.id
                    scheduled_date: startDateStr,
                    delivery_number: 1,
                    status: 'scheduled',  // NOT fulfilled yet
                    custom_items: customItems,  // JSONB object (NOT stringified)
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  })
                
                if (deliveryError) {
                  console.warn('⚠️ Error creating subscription_deliveries:', deliveryError)
                } else {
                  console.log('✓ Subscription delivery created:', deliveryId)
                  
                  // Create customer_substitution_preferences (normalized rows)
                  console.log('🎁 [Subscription Setup] Building preferences from', boxItems.length, 'box items and subscriptions:', orderRequest.subscription?.substitutions)
                  const preferences = buildPreferencesFromRequest(
                    subscriptionRecord.id,
                    orderRequest.tenantId,
                    orderRequest,
                    boxItems,
                    1  // delivery_number
                  )
                  
                  console.log('🎁 [Subscription Setup] Built', preferences.length, 'preferences')
                  if (preferences.length > 0) {
                    console.log('📝 [DEBUG] Inserting preferences:', JSON.stringify(preferences, null, 2))
                    const { error: prefsError, data: prefsData } = await supabaseAdmin
                      .from('customer_substitution_preferences')
                      .insert(preferences)
                    
                    if (prefsError) {
                      console.error('❌ [Subscription Setup] Error creating substitution preferences:', prefsError)
                      console.error('❌ [Subscription Setup] Error details:', JSON.stringify(prefsError, null, 2))
                    } else {
                      console.log('✓ [Subscription Setup] Created', preferences.length, 'substitution preferences. Response:', prefsData)
                    }
                  } else {
                    console.log('⚠️ [Subscription Setup] No preferences to insert')
                  }
                }
              }
            } catch (subRecordError) {
              console.warn('⚠️ Error creating subscription delivery records:', subRecordError)
              // Don't fail the order
            }
          }
        }
      }
    }

    // Send confirmation email to customer (non-blocking, don't fail order if notification fails)
    try {
      if (orderRequest.customerEmail) {
        console.log('📧 [Notify] Sending order confirmation email to customer:', orderRequest.customerEmail);
        console.log('📧 [Notify] Invoking order-notify function with body:', { orderId, emailType: 'order_confirmation', triggerSource: 'storefront' })
        const notifyResult = await supabaseAdmin.functions.invoke('order-notify', {
          body: {
            orderId,
            emailType: 'order_confirmation',
            triggerSource: 'storefront'
          }
        });
        console.log('📧 [Notify] Order confirmation notification result:', JSON.stringify(notifyResult, null, 2));
        if (notifyResult.error) {
          console.error('❌ [Notify] order-notify returned error (non-fatal):', JSON.stringify(notifyResult.error, null, 2));
        } else {
          console.log('✓ [Notify] Confirmation email triggered successfully');
        }
      }
    } catch (notifyError) {
      console.error('❌ [Notify] Failed to send confirmation email (non-fatal):', notifyError);
      console.error('❌ [Notify] Error details:', JSON.stringify(notifyError, null, 2));
    }

    // Notify tenant about new order using order-created-notify function
    try {
      console.log('📧 [Notify Tenant] Sending new order notification to tenant for order:', orderId);
      const tenantNotifyResult = await supabaseAdmin.functions.invoke('order-created-notify', {
        body: {
          orderId,
          tenantId: orderRequest.tenantId,
          customerName: orderRequest.customerName,
          customerEmail: orderRequest.customerEmail,
          customerPhone: orderRequest.customerPhone || null,
          totalCents: orderRequest.totalCents,
          source: 'web',
          notifyCustomer: false  // Send tenant notification (not customer confirmation)
        }
      });
      console.log('📧 [Notify Tenant] Tenant notification result:', JSON.stringify(tenantNotifyResult, null, 2));
      if (tenantNotifyResult.error) {
        console.error('❌ [Notify Tenant] order-created-notify returned error (non-fatal):', JSON.stringify(tenantNotifyResult.error, null, 2));
      } else {
        console.log('✓ [Notify Tenant] Tenant notification triggered successfully');
      }
    } catch (tenantNotifyError) {
      console.error('❌ [Notify Tenant] Failed to send tenant notification (non-fatal):', tenantNotifyError);
      console.error('❌ [Notify Tenant] Error details:', JSON.stringify(tenantNotifyError, null, 2));
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
    const message = error instanceof Error ? error.message : String(error)
    console.error('Error in create-storefront-order function:', error)
    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

// ===== HELPER FUNCTIONS =====

/**
 * Build choices from customer's substitution selections
 * CORRECTED: Deduplicates groups and uses base item ID (not option row ID)
 */
function buildChoicesFromRequest(
  orderRequest: OrderRequest,
  boxItems: any[]
): Array<{
  subscription_box_item_id: string
  chosen_product_id: string
  qty: number
}> {
  const choices: any[] = []
  const processedGroups = new Set<string>()  // Deduplicate groups

  for (const boxItem of boxItems) {
    const groupName = boxItem.substitution_group

    if (groupName && orderRequest.subscription?.substitutions?.[groupName]) {
      // Skip if group already processed (avoid duplicate rows)
      if (processedGroups.has(groupName)) continue
      processedGroups.add(groupName)

      // Find base item (is_substitution_option=false) for this group
      const baseItem = boxItems.find(
        item => item.substitution_group === groupName && !item.is_substitution_option
      )

      if (!baseItem) {
        console.error(`No base item found for substitution group: ${groupName}`)
        continue
      }

      // Group items: customer picked alternatives
      const groupChoices = orderRequest.subscription.substitutions[groupName]
      if (Array.isArray(groupChoices)) {
        for (const choice of groupChoices) {
          choices.push({
            subscription_box_item_id: baseItem.id,  // Use BASE item ID
            chosen_product_id: choice.productId || choice.product_id,
            qty: choice.quantity || choice.qty || 1,
          })
        }
      }
    } else if (!boxItem.is_optional && !groupName && !boxItem.is_substitution_option) {
      // Non-optional, ungrouped: use default product
      choices.push({
        subscription_box_item_id: boxItem.id,
        chosen_product_id: boxItem.product_id,
        qty: boxItem.default_quantity || 1,
      })
    }
    // Optional items without explicit selection: skip
  }

  return choices
}

/**
 * Build normalized preferences for customer_substitution_preferences table
 * FIXED: Handles flat productId -> quantity map from storefront
 */
function buildPreferencesFromRequest(
  customerSubscriptionId: string,
  tenantId: string,
  orderRequest: OrderRequest,
  boxItems: any[],
  deliveryNumber: number
): any[] {
  const preferences: any[] = []
  const processedGroups = new Set<string>()

  console.log('📝 [buildPreferencesFromRequest] Input substitutions:', orderRequest.subscription?.substitutions)

  // Helper: find base item for a group (or first item if no base exists)
  const getBaseItemForGroup = (groupName: string) => {
    // Try to find base item (is_substitution_option=false)
    const baseItem = boxItems.find(
      item => item.substitution_group === groupName && !item.is_substitution_option
    )
    if (baseItem) return baseItem
    
    // Fallback: use first item in group if all are substitution options
    return boxItems.find(item => item.substitution_group === groupName)
  }

  // Helper: find which group a product belongs to
  const getGroupForProduct = (productId: string) => {
    const item = boxItems.find(item => item.product_id === productId)
    return item?.substitution_group || null
  }

  // Process explicit substitutions from storefront
  const substitutions = orderRequest.subscription?.substitutions || {}
  console.log('📝 Substitutions object type:', typeof substitutions, 'value:', substitutions)

  // Substitutions can be:
  // 1. Flat: { productId1: qty, productId2: qty }
  // 2. Grouped: { groupName: [{ productId, quantity }, ...] }
  // Detect format and process accordingly
  const isGrouped = Object.values(substitutions).some(v => Array.isArray(v))

  if (isGrouped) {
    // Format: { groupName: [{productId, quantity}, ...] }
    console.log('📝 Processing grouped substitutions format')
    for (const [groupName, items] of Object.entries(substitutions)) {
      if (!Array.isArray(items)) continue
      if (processedGroups.has(groupName)) continue
      processedGroups.add(groupName)

      const baseItem = getBaseItemForGroup(groupName)
      if (!baseItem) {
        console.warn(`⚠️ No base item found for group: ${groupName}`)
        continue
      }

      for (const item of items) {
        preferences.push({
          tenant_id: tenantId,
          customer_subscription_id: customerSubscriptionId,
          subscription_box_item_id: baseItem.id,
          chosen_product_id: item.productId || item.product_id,
          chosen_quantity: item.quantity || item.qty || 1,
          delivery_number: deliveryNumber,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    }
  } else {
    // Format: { productId: qty, productId: qty, ... } (flat)
    console.log('📝 Processing flat substitutions format')
    for (const [key, qty] of Object.entries(substitutions)) {
      const groupName = getGroupForProduct(key)
      if (!groupName) {
        console.log(`⚠️ Product ${key} not found in box items, skipping`)
        continue
      }

      // For flat format: Allow multiple products from same group (customer can pick multiple substitutions)
      // Mark group as processed only for default-filling later
      const baseItem = getBaseItemForGroup(groupName)
      if (!baseItem) {
        console.warn(`⚠️ No base item found for group: ${groupName}`)
        continue
      }

      preferences.push({
        tenant_id: tenantId,
        customer_subscription_id: customerSubscriptionId,
        subscription_box_item_id: baseItem.id,
        chosen_product_id: key,  // The product ID
        chosen_quantity: Number(qty) || 1,
        delivery_number: deliveryNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      console.log(`✓ Added preference: group=${groupName}, product=${key}, qty=${qty}`)
      
      // Mark group as processed so we don't add defaults for it later
      processedGroups.add(groupName)
    }
  }

  // Also add defaults for groups NOT in substitutions (non-optional groups)
  for (const boxItem of boxItems) {
    const groupName = boxItem.substitution_group
    if (groupName && !processedGroups.has(groupName) && !boxItem.is_optional) {
      // Non-optional group with no substitution: add default
      processedGroups.add(groupName)
      const baseItem = getBaseItemForGroup(groupName)
      if (baseItem) {
        preferences.push({
          tenant_id: tenantId,
          customer_subscription_id: customerSubscriptionId,
          subscription_box_item_id: baseItem.id,
          chosen_product_id: baseItem.product_id,
          chosen_quantity: baseItem.default_quantity || 1,
          delivery_number: deliveryNumber,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        console.log(`✓ Added default preference for group: ${groupName}`)
      }
    }
  }

  // Add non-grouped, non-optional items with their defaults
  for (const boxItem of boxItems) {
    if (!boxItem.substitution_group && !boxItem.is_optional && !boxItem.is_substitution_option) {
      preferences.push({
        tenant_id: tenantId,
        customer_subscription_id: customerSubscriptionId,
        subscription_box_item_id: boxItem.id,
        chosen_product_id: boxItem.product_id,
        chosen_quantity: boxItem.default_quantity || 1,
        delivery_number: deliveryNumber,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      console.log(`✓ Added default for non-grouped item: ${boxItem.product_id}`)
    }
  }

  console.log(`✓ Built ${preferences.length} total preferences`)
  return preferences
}
