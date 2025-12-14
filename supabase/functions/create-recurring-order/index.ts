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
        *,
        order_lines (*)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      throw new Error('Order not found or access denied');
    }

    if (!order.order_lines || order.order_lines.length === 0) {
      throw new Error('Order has no items');
    }

    // Simply duplicate the order with recurring flag
    const { data: newOrder, error: newOrderError } = await supabaseAdmin
      .from('orders')
      .insert({
        tenant_id: order.tenant_id,
        customer_email: order.customer_email,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        status: 'pending',
        total_cents: order.total_cents,
        source: 'recurring',
        is_subscription_order: true,
        is_recurring: true,
        recurrence_frequency: frequency,
        recurrence_interval: interval,
        recurrence_duration: duration,
        note: order.note,
      })
      .select()
      .single();

    if (newOrderError) {
      throw new Error(`Failed to create recurring order: ${newOrderError.message}`);
    }

    // Copy order_lines
    const newOrderLines = order.order_lines.map((line: any) => ({
      order_id: newOrder.id,
      tenant_id: order.tenant_id,
      product_id: line.product_id,
      quantity: line.quantity,
      price_per: line.price_per,
      line_total_cents: line.line_total_cents || 0,
      bin_weight: line.bin_weight || null,
      unit_price_cents: line.unit_price_cents || null,
      price_per_lb_cents: line.price_per_lb_cents || null,
      weight_lbs: line.weight_lbs || null,
    }));

    const { error: linesError } = await supabaseAdmin
      .from('order_lines')
      .insert(newOrderLines);

    if (linesError) {
      throw new Error(`Failed to create order lines: ${linesError.message}`);
    }

    // Also update the original order to mark it as recurring (for POS display)
    await supabaseAdmin
      .from('orders')
      .update({
        is_recurring: true,
        recurrence_frequency: frequency,
        recurrence_interval: interval,
        recurrence_duration: duration,
      })
      .eq('id', orderId);

    return new Response(
      JSON.stringify({
        success: true,
        order_id: newOrder.id,
        message: `Recurring order created! Will repeat every ${frequency} ${interval}${frequency > 1 ? 's' : ''}`,
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
