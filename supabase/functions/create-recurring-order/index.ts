import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RecurringOrderRequest {
  orderId: string;
  frequency: number;
  interval: 'week' | 'month';
  duration?: number;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { orderId, frequency, interval, duration }: RecurringOrderRequest = await req.json();

    // Validate input
    if (!orderId || !frequency || !interval) {
      throw new Error('Missing required fields: orderId, frequency, interval');
    }

    // Get the original order with order_lines
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        tenant_id,
        user_id,
        customer_email,
        total_cents,
        order_lines (
          product_id,
          product_name,
          quantity,
          unit_price_cents
        )
      `)
      .eq('id', orderId)
      .eq('user_id', user.id) // Ensure user owns this order
      .single();

    if (orderError || !order) {
      throw new Error('Order not found or access denied');
    }

    if (!order.order_lines || order.order_lines.length === 0) {
      throw new Error('Order has no items');
    }

    // Calculate next delivery date
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysToAdd = interval === 'week' ? frequency * 7 : frequency * 30;
    const nextDeliveryDate = new Date(Date.now() + daysToAdd * msPerDay).toISOString();

    // Create subscription product
    const { data: subProduct, error: productError } = await supabaseAdmin
      .from('subscription_products')
      .insert({
        tenant_id: order.tenant_id,
        product_id: order.order_lines[0].product_id, // Use first product as reference
        name: `Recurring Order from #${order.id.slice(0, 8)}`,
        description: `Automatically reorders ${order.order_lines.length} item(s) from order #${order.id.slice(0, 8)}`,
        price_per_interval: order.total_cents / 100,
      })
      .select()
      .single();

    if (productError) {
      throw new Error(`Failed to create subscription product: ${productError.message}`);
    }

    // Create subscription_box_items for each product in the order
    const boxItems = order.order_lines.map((line: any) => ({
      subscription_product_id: subProduct.id,
      product_id: line.product_id,
      default_quantity: line.quantity,
      quantity_type: 'fixed',
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('subscription_box_items')
      .insert(boxItems);

    if (itemsError) {
      // Rollback: delete the subscription product
      await supabaseAdmin.from('subscription_products').delete().eq('id', subProduct.id);
      throw new Error(`Failed to create subscription items: ${itemsError.message}`);
    }

    // Create customer subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('customer_subscriptions')
      .insert({
        tenant_id: order.tenant_id,
        subscription_product_id: subProduct.id,
        customer_name: user.user_metadata?.full_name || user.email || '',
        customer_email: order.customer_email || user.email || '',
        customer_phone: user.user_metadata?.phone || null,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0],
        next_delivery_date: nextDeliveryDate.split('T')[0],
        price_per_interval: order.total_cents / 100,
        interval_type: interval,
        interval_count: frequency,
        deliveries_fulfilled: 0,
        total_deliveries_expected: duration,
        pickup_location: order.pickup_location || null,
        delivery_notes: order.note || null,
      })
      .select()
      .single();

    if (subError) {
      // Rollback: delete subscription product and items
      await supabaseAdmin.from('subscription_box_items').delete().eq('subscription_product_id', subProduct.id);
      await supabaseAdmin.from('subscription_products').delete().eq('id', subProduct.id);
      throw new Error(`Failed to create subscription: ${subError.message}`);
    }

    // Create initial order for the subscription
    const { data: newOrder, error: newOrderError } = await supabaseAdmin
      .from('orders')
      .insert({
        tenant_id: order.tenant_id,
        customer_email: order.customer_email,
        customer_name: user.user_metadata?.full_name || user.email || '',
        customer_phone: user.user_metadata?.phone || order.customer_phone || null,
        status: 'pending',
        total_cents: order.total_cents,
        source: 'subscription',
        is_subscription_order: true,
        pickup_location: order.pickup_location || null,
        note: `Recurring order from #${order.id.slice(0, 8)} - Every ${frequency} ${interval}${frequency > 1 ? 's' : ''}${duration ? ` for ${duration} occurrences` : ' (ongoing)'}`,
      })
      .select()
      .single();

    if (newOrderError) {
      throw new Error(`Failed to create initial order: ${newOrderError.message}`);
    }

    // Create order_lines for the new order
    const newOrderLines = order.order_lines.map((line: any) => ({
      order_id: newOrder.id,
      product_id: line.product_id,
      product_name: line.product_name,
      quantity: line.quantity,
      unit_price_cents: line.unit_price_cents,
    }));

    const { error: linesError } = await supabaseAdmin
      .from('order_lines')
      .insert(newOrderLines);

    if (linesError) {
      console.error('Failed to create order lines:', linesError);
      // Don't fail the whole operation for this
    }

    return new Response(
      JSON.stringify({
        success: true,
        subscription_id: subscription.id,
        order_id: newOrder.id,
        next_delivery_date: nextDeliveryDate,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error creating recurring order:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
