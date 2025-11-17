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
  unitPrice: number
  lineTotalCents: number
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
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        id: orderId,
        tenant_id: orderRequest.tenantId,
        customer_name: orderRequest.customerName,
        customer_email: orderRequest.customerEmail,
        customer_phone: orderRequest.customerPhone,
        delivery_method: orderRequest.deliveryMethod,
        delivery_address: orderRequest.deliveryAddress,
        delivery_notes: orderRequest.deliveryNotes,
        payment_method: orderRequest.paymentMethod,
        subtotal_cents: orderRequest.subtotalCents,
        tax_cents: orderRequest.taxCents,
        total_cents: orderRequest.totalCents,
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
          price_per: line.unitPrice,
          line_total_cents: line.lineTotalCents,
          weight_bin_id: line.weightBinId,
          created_at: new Date().toISOString(),
        })

      if (lineError) {
        console.error('Error creating order line:', lineError)
        throw lineError
      }

      // Decrement product inventory
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('qty')
        .eq('id', line.productId)
        .single()

      if (productError) {
        console.error('Error fetching product:', productError)
        throw productError
      }

      const newQty = (product.qty || 0) - line.qty
      const { error: updateError } = await supabaseAdmin
        .from('products')
        .update({
          qty: newQty,
          updated_at: new Date().toISOString(),
        })
        .eq('id', line.productId)

      if (updateError) {
        console.error('Error updating product inventory:', updateError)
        throw updateError
      }

      console.log(`Decremented inventory for ${line.productName}: ${product.qty} -> ${newQty}`)
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
