import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface RecurringOrder {
  id: string;
  tenant_id: string;
  customer_email: string;
  customer_name: string;
  customer_phone: string | null;
  total_cents: number;
  note: string | null;
  recurrence_frequency: number;
  recurrence_interval: 'week' | 'month';
  recurrence_duration: number | null;
  created_at: string;
  order_lines: Array<{
    product_id: string;
    quantity: number;
    price_per: number;
    line_total_cents: number;
    bin_weight: number | null;
    unit_price_cents: number | null;
    price_per_lb_cents: number | null;
    weight_lbs: number | null;
  }>;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔁 Recurring order renewal cron job started');
    
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      throw new Error('Supabase admin env vars missing');
    }
    
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { 
      auth: { persistSession: false } 
    });

    // Get all active recurring orders
    const { data: recurringOrders, error: ordersError } = await admin
      .from('orders')
      .select(`
        id,
        tenant_id,
        customer_email,
        customer_name,
        customer_phone,
        total_cents,
        note,
        recurrence_frequency,
        recurrence_interval,
        recurrence_duration,
        created_at,
        order_lines (
          product_id,
          quantity,
          price_per,
          line_total_cents,
          bin_weight,
          unit_price_cents,
          price_per_lb_cents,
          weight_lbs
        )
      `)
      .eq('is_recurring', true)
      .eq('status', 'completed')
      .not('recurrence_frequency', 'is', null)
      .not('recurrence_interval', 'is', null);

    if (ordersError) {
      console.error('❌ Error fetching recurring orders:', ordersError);
      throw ordersError;
    }

    console.log(`✓ Found ${recurringOrders?.length || 0} recurring orders`);

    if (!recurringOrders || recurringOrders.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No recurring orders to process',
          processed: 0 
        }), 
        { headers: corsHeaders }
      );
    }

    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as any[],
    };

    const now = new Date();

    // Process each recurring order
    for (const order of recurringOrders as RecurringOrder[]) {
      try {
        // Calculate when the next order should be created
        const createdAt = new Date(order.created_at);
        const intervalMs = order.recurrence_interval === 'week' 
          ? order.recurrence_frequency * 7 * 24 * 60 * 60 * 1000
          : order.recurrence_frequency * 30 * 24 * 60 * 60 * 1000; // Approximate month as 30 days
        
        const nextDueDate = new Date(createdAt.getTime() + intervalMs);

        // Check if it's time to create a new order
        if (now < nextDueDate) {
          console.log(`⏭️ Skipping order ${order.id} - not due yet (due: ${nextDueDate.toISOString()})`);
          continue;
        }

        results.processed++;
        console.log(`\n🔁 Processing recurring order ${order.id} for ${order.customer_name}`);

        // Check if we've reached the duration limit
        if (order.recurrence_duration) {
          // Count how many orders have been created from this recurring order
          const { count } = await admin
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .eq('source', 'recurring')
            .eq('customer_email', order.customer_email)
            .eq('total_cents', order.total_cents);

          if (count && count >= order.recurrence_duration) {
            console.log(`✋ Duration limit reached for order ${order.id} (${count}/${order.recurrence_duration})`);
            
            // Disable recurring for this order
            await admin
              .from('orders')
              .update({ is_recurring: false })
              .eq('id', order.id);
            
            continue;
          }
        }

        // Create new order
        const { data: newOrder, error: newOrderError } = await admin
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
            note: order.note,
          })
          .select()
          .single();

        if (newOrderError) {
          throw new Error(`Failed to create order: ${newOrderError.message}`);
        }

        console.log(`✓ Created new order ${newOrder.id}`);

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

        const { error: linesError } = await admin
          .from('order_lines')
          .insert(newOrderLines);

        if (linesError) {
          throw new Error(`Failed to create order lines: ${linesError.message}`);
        }

        console.log(`✓ Created ${newOrderLines.length} order lines`);

        // Update the original order's created_at to track the next interval
        await admin
          .from('orders')
          .update({ created_at: now.toISOString() })
          .eq('id', order.id);

        results.successful++;
        console.log(`✅ Successfully processed recurring order ${order.id}`);

      } catch (error: any) {
        results.failed++;
        console.error(`❌ Failed to process order ${order.id}:`, error);
        results.errors.push({
          order_id: order.id,
          error: error.message
        });
      }
    }

    console.log('\n📊 Renewal Summary:', results);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${results.processed} recurring orders`,
        results 
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error('❌ Cron job failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }), 
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
