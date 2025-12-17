import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// deno-lint-ignore no-explicit-any
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type EmailType = 'order_confirmation' | 'order_ready';

interface NotifyBody {
  orderId: string;
  emailType: EmailType;          // REQUIRED
  triggerSource?: 'pos' | 'storefront';
}

interface OrderData {
  id: string;
  status: string;
  tenant_id: string;
  customer_email?: string;
  customer_phone?: string;
  customer_name?: string;
  fulfillment_method?: string;
  pickup_location?: string;
  total_cents: number;
  tax_cents?: number;
  subtotal_cents?: number;
  deposit_amount?: number;
  deposit_paid_at?: string;
  balance_due?: number;
  notified_ready_at?: string;
  created_at?: string;
}

interface OrderLine {
  id: string;
  product_id?: string;
  product_name?: string;
  quantity?: number;
  weight_lbs?: number;
  unit_price_cents?: number;
  line_total_cents?: number;
  fulfillment_bucket?: string;
  selected_bins?: any;
  reserved_at?: string;
  reservation_expires_at?: string;
}

/**
 * Format cents as USD string
 */
function money(cents?: number | null): string {
  const n = typeof cents === 'number' ? cents : 0;
  return `$${(n / 100).toFixed(2)}`;
}

/**
 * Format order line for display
 */
function lineText(l: OrderLine): string {
  const qty = l.quantity ?? 0;
  const name = l.product_name || l.product_id || 'Item';
  const weight = l.weight_lbs ? ` (${l.weight_lbs} lb req)` : '';
  const total = l.line_total_cents != null ? ` — ${money(l.line_total_cents)}` : '';
  return `• ${qty} x ${name}${weight}${total}`;
}

/**
 * Send email via SendGrid
 */
async function sendEmail(to: string, subject: string, body: string): Promise<any> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY');
  if (!apiKey) {
    console.log('⚠️ SENDGRID_API_KEY missing; skipping email send');
    return { skipped: true };
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: to }],
          subject: subject,
        }],
        from: {
          email: 'orders@purveyos.io',
          name: 'PurveyOS Notifications'
        },
        content: [{
          type: 'text/plain',
          value: body
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ SendGrid error:', error);
      return { error, ok: false };
    }

    console.log(`✓ Email sent to ${to}: ${subject}`);
    return { ok: true };
  } catch (error) {
    console.error('❌ Email send failed:', error);
    return { error: String(error), ok: false };
  }
}

/**
 * Send SMS via Twilio (stub)
 */
async function sendSms(to: string, body: string): Promise<any> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const auth = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!sid || !auth || !from) {
    console.log('⚠️ Twilio vars missing; skipping SMS send');
    return { skipped: true };
  }
  console.log(`✓ SMS sent to ${to}: ${body.substring(0, 50)}...`);
  return { ok: true };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body: NotifyBody = await req.json();
    console.log('🔔 order-notify called with:', { orderId: body.orderId, emailType: body.emailType, triggerSource: body.triggerSource });

    if (!body.orderId) throw new Error('orderId required');
    if (!body.emailType) throw new Error('emailType required');
    if (!['order_confirmation', 'order_ready'].includes(body.emailType)) {
      throw new Error(`emailType must be 'order_confirmation' or 'order_ready', got: ${body.emailType}`);
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error('Supabase admin env vars missing');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Fetch order - use minimal fields
    console.log('📦 Loading order:', body.orderId);
    let order: OrderData | null = null;
    try {
      const { data, error } = await admin
        .from('orders')
        .select('*')
        .eq('id', body.orderId)
        .maybeSingle() as { data: any | null; error: any };
      
      if (error) {
        console.error('❌ Order fetch error:', error);
        throw error;
      }
      if (!data) {
        console.error('❌ Order not found:', body.orderId);
        throw new Error('Order not found');
      }
      order = data;
    } catch (err) {
      console.error('❌ Failed to fetch order:', err);
      throw err;
    }

    console.log('✓ Order loaded:', { id: order.id, customer_email: order.customer_email || 'N/A' });

    // Fetch order_lines - use minimal fields
    console.log('📋 Fetching order_lines for:', body.orderId);
    let allLines: OrderLine[] = [];
    try {
      const { data, error } = await admin
        .from('order_lines')
        .select('*')
        .eq('order_id', body.orderId)
        .order('created_at', { ascending: true }) as { data: any[] | null; error: any };
      
      if (error) {
        console.error('⚠️ Order lines fetch warning (non-fatal):', error);
        // Don't throw - continue even if lines fetch fails
      } else {
        allLines = data || [];
      }
    } catch (err) {
      console.error('⚠️ Order lines fetch exception (non-fatal):', err);
    }

    const nowLines = allLines.filter(l => (l.fulfillment_bucket || '').toUpperCase() === 'NOW');
    const laterLines = allLines.filter(l => (l.fulfillment_bucket || '').toUpperCase() === 'LATER');

    console.log(`✓ Fetched ${allLines.length} order lines: ${nowLines.length} NOW, ${laterLines.length} LATER`);

    // Fetch tenant
    console.log('🏢 Loading tenant:', order.tenant_id);
    let tenant: any = null;
    try {
      const { data } = await admin
        .from('tenants')
        .select('*')
        .eq('id', order.tenant_id)
        .maybeSingle() as { data: any | null };
      tenant = data;
    } catch (err) {
      console.error('⚠️ Tenant fetch warning (non-fatal):', err);
    }

    const tenantName = tenant?.name || 'Your Farm';
    const fulfillmentMethod = order.fulfillment_method || 'pickup';
    const customerName = order.customer_name || 'there';
    const notificationSettings = (tenant?.notification_settings as any) || {};

    const pickupLocation = notificationSettings.pickup_location || 'our pickup location';
    const pickupHours = notificationSettings.pickup_hours || 'during business hours';
    const specialInstructions = notificationSettings.special_instructions || '';
    const storefrontUrl = notificationSettings.storefront_url || '';

    let subject = '';
    let emailBody = '';
    let smsMessage = '';

    // Build message based on emailType
    if (body.emailType === 'order_confirmation') {
      subject = `Order received — ${tenantName} (Order ${order.id})`;

      emailBody =
`Hi ${customerName},

Thanks! We received your order from ${tenantName}.

ORDER ${order.id}
Placed: ${order.created_at || ''}

In Stock (NOW) items
${nowLines.length ? nowLines.map(lineText).join('\n') : '• None'}

Preorder (LATER) items
${laterLines.length ? laterLines.map(lineText).join('\n') : '• None'}

What to expect:
• NOW: We're preparing these now.
• LATER: These items will be fulfilled when inventory becomes available. Final weight/price may vary; we'll confirm before pickup.

Pickup info:
Location: ${pickupLocation}
Hours: ${pickupHours}
${specialInstructions ? `\n${specialInstructions}\n` : ''}

Totals:
Subtotal: ${money(order.subtotal_cents)}
Tax: ${money(order.tax_cents)}
Total: ${money(order.total_cents)}

${storefrontUrl ? `Manage your order: ${storefrontUrl}\n` : ''}

Thank you!
${tenantName}
`;

      smsMessage = `Order received from ${tenantName}. We'll notify you when it's ready. Order: ${order.id}`;
    }

    if (body.emailType === 'order_ready') {
      const methodText = fulfillmentMethod === 'delivery' ? 'delivery' : 'pickup';
      subject = `Hi ${customerName}, your order from ${tenantName} is ready for ${methodText}!`;

      emailBody =
`Hi ${customerName},

Great news! Your order from ${tenantName} is ready for ${methodText}.

Order ${order.id}

Items:
${(allLines || []).map(lineText).join('\n')}

${fulfillmentMethod === 'pickup'
  ? `Pickup Location: ${pickupLocation}\nPickup Hours: ${pickupHours}\n`
  : `Delivery address: ${order.pickup_location || 'your specified address'}\n`
}

${specialInstructions ? `\n${specialInstructions}\n` : ''}

Thank you!
${tenantName}
`;

      smsMessage = `Your ${tenantName} order is ready. Order: ${order.id}`;
    }

    // Check idempotency: skip if already notified
    if (body.emailType === 'order_ready' && order.notified_ready_at && order.status === 'ready') {
      console.log('⚠️ Already notified for ready status; skipping');
      return new Response(JSON.stringify({ skipped: true, reason: 'already_notified' }), { headers: corsHeaders });
    }

    // Send messages
    const messages: any[] = [];

    if (order.customer_email) {
      console.log('📧 Sending email to:', order.customer_email);
      const emailRes = await sendEmail(order.customer_email, subject, emailBody);
      messages.push({ channel: 'email', ...emailRes });
      console.log('📧 Email result:', emailRes);
    } else {
      console.log('⚠️ No customer_email found for order');
    }

    if (order.customer_phone) {
      console.log('📱 Sending SMS to:', order.customer_phone);
      const smsRes = await sendSms(order.customer_phone, smsMessage);
      messages.push({ channel: 'sms', ...smsRes });
      console.log('📱 SMS result:', smsRes);
    } else {
      console.log('⚠️ No customer_phone found for order');
    }

    // Update order notification timestamp if ready
    if (body.emailType === 'order_ready' && messages.some(m => m.ok)) {
      const { error: upErr } = await admin
        .from('orders')
        .update({ notified_ready_at: new Date().toISOString() })
        .eq('id', order.id);
      if (upErr) console.error('❌ Failed to set notified_ready_at:', upErr.message);
      else console.log('✓ Updated notified_ready_at');
    }

    // Log to notifications_log
    for (const msg of messages) {
      try {
        await admin.from('notifications_log').insert({
          tenant_id: order.tenant_id,
          order_id: order.id,
          channel: msg.channel,
          recipient: msg.channel === 'email' ? order.customer_email : order.customer_phone,
          status: msg.ok ? 'sent' : (msg.skipped ? 'skipped' : 'failed'),
          email_type: body.emailType,
          trigger_source: body.triggerSource || 'storefront',
          error_message: msg.error ? `[${body.emailType}] ${msg.error}` : `[${body.emailType}]`,
        });
      } catch (logErr) {
        console.error('⚠️ Failed to log notification:', (logErr as any)?.message || logErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, messages, emailType: body.emailType }), { headers: corsHeaders });
  } catch (err) {
    const message = (err as any)?.message || String(err);
    console.error('❌ order-notify error:', message);
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: corsHeaders });
  }
});
