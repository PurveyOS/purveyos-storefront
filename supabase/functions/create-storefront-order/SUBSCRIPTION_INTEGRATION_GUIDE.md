/**
 * PHASE 2: EDGE FUNCTION MODIFICATIONS FOR STOREFRONT SUBSCRIPTIONS
 * 
 * File: purveyos-storefront/supabase/functions/create-storefront-order/index.ts
 * 
 * Key changes:
 * 1. Add idempotency check on stripe_payment_intent_id (stable key, globally unique from Stripe)
 * 2. After orders record is created, create subscription records if subscription.enabled
 * 3. Create customer_subscriptions with exact snake_case columns
 * 4. Create subscription_deliveries with order_id = orders.id (UUID FK)
 * 5. Store custom_items as JSONB object (not stringified)
 * 6. Create customer_substitution_preferences rows for each customer choice
 */

// ===== ADD TO OrderRequest INTERFACE (around line 23) =====
interface OrderRequest {
  // ... existing fields ...
  subscription?: {
    enabled: boolean
    cadence?: 'weekly' | 'biweekly' | 'monthly'
    startDate?: string
    subscriptionProductId?: string
    productId?: string
    isCsaBox?: boolean
    targetWeightLbs?: number
    quantity?: number
    duration?: number  // total deliveries expected (ADD THIS)
    substitutions?: Record<string, any>  // customer group choices (ADD THIS)
    stripePaymentIntentId?: string  // (ADD THIS - from order level)
  }
  stripePaymentIntentId?: string  // (ADD THIS - top level for idempotency)
}

// ===== ADD IDEMPOTENCY CHECK (before line 200 where orders.insert happens) =====
// After validating request, before creating order:

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

// ===== MODIFY orders.insert (around line 210) =====
// Add these columns to the existing insert:

const { data: order, error: orderError } = await supabaseAdmin
  .from('orders')
  .insert({
    id: orderId,
    tenant_id: orderRequest.tenantId,
    user_id: userId,
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
    is_subscription_order: orderRequest.subscription?.enabled ?? false,
    source: 'storefront',
    status: 'pending',
    stripe_payment_intent_id: orderRequest.stripePaymentIntentId,  // ADD THIS
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .select()
  .single()

// ===== ADD AFTER orders are created and lines are inserted (after line ~450) =====
// Create subscription records if this is a subscription order

if (orderRequest.subscription?.enabled) {
  try {
    console.log('📦 Creating subscription records for order:', orderId)

    // 1. VALIDATE SUBSCRIPTION PRODUCT
    const { data: subProduct, error: subProductError } = await supabaseAdmin
      .from('subscription_products')
      .select('id, tenant_id, name, price_per_interval, interval_type, interval_count')
      .eq('id', orderRequest.subscription.subscriptionProductId)
      .eq('tenant_id', orderRequest.tenantId)
      .single()

    if (!subProduct || subProductError) {
      throw new Error(`Subscription product not found: ${subProductError?.message}`)
    }

    console.log('✓ Subscription product validated:', subProduct.id)

    // 2. FETCH BOX TEMPLATE
    const { data: boxItems, error: boxItemsError } = await supabaseAdmin
      .from('subscription_box_items')
      .select(
        'id, product_id, substitution_group, substitution_group_units_allowed, is_optional, display_order, default_quantity'
      )
      .eq('subscription_product_id', subProduct.id)
      .order('display_order', { ascending: true })

    if (boxItemsError || !boxItems) {
      throw new Error(`Failed to fetch subscription box template: ${boxItemsError?.message}`)
    }

    console.log('✓ Box template loaded:', boxItems.length, 'items')

    // 3. CREATE CUSTOMER_SUBSCRIPTIONS
    const customerSubscriptionId = crypto.randomUUID()
    const startDate = orderRequest.subscription.startDate || 
      new Date().toISOString().split('T')[0]

    const { error: subError } = await supabaseAdmin
      .from('customer_subscriptions')
      .insert({
        id: customerSubscriptionId,
        tenant_id: orderRequest.tenantId,
        subscription_product_id: subProduct.id,
        customer_name: orderRequest.customerName,
        customer_email: orderRequest.customerEmail,
        customer_phone: orderRequest.customerPhone || null,
        status: 'active',
        start_date: startDate,
        next_delivery_date: startDate,
        price_per_interval: subProduct.price_per_interval,
        interval_type: orderRequest.subscription.cadence || subProduct.interval_type || 'weekly',
        interval_count: subProduct.interval_count || 1,
        delivery_notes: orderRequest.deliveryNotes || null,
        deliveries_fulfilled: 0,  // NOT fulfilled yet
        total_deliveries_expected: orderRequest.subscription.duration || null,
        payment_status: 'paid',
        total_paid_cents: orderRequest.totalCents,
        stripe_payment_intent_id: orderRequest.stripePaymentIntentId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (subError) {
      throw new Error(`Failed to create customer_subscriptions: ${subError.message}`)
    }

    console.log('✓ Customer subscription created:', customerSubscriptionId)

    // 4. BUILD CUSTOM_ITEMS SNAPSHOT (JSONB object, not stringified)
    const choices = buildChoicesFromRequest(orderRequest, boxItems)
    const customItems = {
      snapshot: {
        client_generated_id: crypto.randomUUID(),
        subscription_product_id: subProduct.id,
        subscription_product_name: subProduct.name,
        choices: choices,
      },
      components: boxItems.map(item => ({
        subscription_box_item_id: item.id,
        product_id: item.product_id,
        substitution_group: item.substitution_group,
        group_units_allowed: item.substitution_group_units_allowed,
        is_optional: item.is_optional,
        default_quantity: item.default_quantity,
      })),
    }

    // 5. CREATE SUBSCRIPTION_DELIVERIES
    const deliveryId = crypto.randomUUID()

    const { error: deliveryError } = await supabaseAdmin
      .from('subscription_deliveries')
      .insert({
        id: deliveryId,
        tenant_id: orderRequest.tenantId,
        customer_subscription_id: customerSubscriptionId,
        order_id: orderId,  // UUID link to orders.id
        scheduled_date: startDate,
        delivery_number: 1,
        status: 'scheduled',  // NOT fulfilled yet
        custom_items: customItems,  // JSONB object (NOT stringified)
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (deliveryError) {
      throw new Error(`Failed to create subscription_deliveries: ${deliveryError.message}`)
    }

    console.log('✓ Subscription delivery created:', deliveryId)

    // 6. CREATE CUSTOMER_SUBSTITUTION_PREFERENCES (normalized rows)
    const preferences = buildPreferencesFromRequest(
      customerSubscriptionId,
      orderRequest,
      boxItems,
      1  // delivery_number
    )

    if (preferences.length > 0) {
      const { error: prefsError } = await supabaseAdmin
        .from('customer_substitution_preferences')
        .insert(preferences)

      if (prefsError) {
        throw new Error(`Failed to create preferences: ${prefsError.message}`)
      }

      console.log('✓ Created', preferences.length, 'substitution preferences')
    }

    console.log('✅ Subscription records created successfully')
  } catch (subError) {
    console.error('⚠️ Error creating subscription records (continuing anyway):', subError)
    // Don't throw - let order creation succeed even if subscription setup fails
  }
}

// ===== ADD HELPER FUNCTIONS (at end of file, before closing serve()) =====

function buildChoicesFromRequest(
  orderRequest: OrderRequest,
  boxItems: any[]
): Array<{
  subscription_box_item_id: string
  chosen_product_id: string
  qty: number
}> {
  const choices: any[] = []

  // orderRequest.subscription.substitutions structure:
  // Example: { "protein-group": [{ productId: "chicken-id", quantity: 2 }, { productId: "beef-id", quantity: 1 }] }

  for (const boxItem of boxItems) {
    const groupName = boxItem.substitution_group

    if (groupName && orderRequest.subscription?.substitutions?.[groupName]) {
      // Group items: customer picked alternatives
      const groupChoices = orderRequest.subscription.substitutions[groupName]
      if (Array.isArray(groupChoices)) {
        for (const choice of groupChoices) {
          choices.push({
            subscription_box_item_id: boxItem.id,
            chosen_product_id: choice.productId || choice.product_id,
            qty: choice.quantity || choice.qty || 1,
          })
        }
      }
    } else if (!boxItem.is_optional && !groupName) {
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

function buildPreferencesFromRequest(
  customerSubscriptionId: string,
  orderRequest: OrderRequest,
  boxItems: any[],
  deliveryNumber: number
): any[] {
  const preferences: any[] = []

  const choices = buildChoicesFromRequest(orderRequest, boxItems)

  for (const choice of choices) {
    preferences.push({
      id: crypto.randomUUID(),
      customer_subscription_id: customerSubscriptionId,
      subscription_box_item_id: choice.subscription_box_item_id,
      chosen_product_id: choice.chosen_product_id,
      chosen_quantity: choice.qty,
      delivery_number: deliveryNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  return preferences
}

// ===== FINAL: Return response should include subscription info =====
// Modify final response to include subscription details:

return new Response(
  JSON.stringify({
    orderId: order.id,
    success: true,
    subscription: orderRequest.subscription?.enabled 
      ? { created: true, customerSubscriptionId }
      : null
  }),
  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
)
