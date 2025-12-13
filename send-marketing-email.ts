import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketingEmailRequest {
  campaign_id: string;
  tenant_id: string;
  subject: string;
  body: string;
  template?: string;
  recipient_filter?: 'all' | 'subscribed' | 'custom';
  recipient_emails?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const body: MarketingEmailRequest = await req.json();
    const { campaign_id, tenant_id, subject, body: emailBody, template, recipient_filter = 'subscribed', recipient_emails } = body;

    // Get SendGrid API key from secrets
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');
    if (!sendgridApiKey) {
      throw new Error('SENDGRID_API_KEY not configured');
    }

    // Determine recipient list
    let recipients: string[] = [];

    if (recipient_filter === 'custom' && recipient_emails) {
      recipients = recipient_emails;
    } else {
      // Get customers from customer_profiles for this tenant
      const query = supabaseClient
        .from('customer_profiles')
        .select('email')
        .eq('tenant_id', tenant_id);

      if (recipient_filter === 'subscribed') {
        query.eq('email_notifications', true);
      }

      const { data: customers, error: customersError } = await query;

      if (customersError) {
        throw new Error(`Failed to fetch customers: ${customersError.message}`);
      }

      recipients = (customers || []).map((c: any) => c.email).filter(Boolean);
    }

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No recipients found', sent_count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tenant info for from address
    const { data: tenantData } = await supabaseClient
      .from('tenants')
      .select('name, email')
      .eq('id', tenant_id)
      .single();

    const fromEmail = tenantData?.email || 'noreply@purveyos.com';
    const fromName = tenantData?.name || 'PurveyOS';

    // Send emails via SendGrid
    const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: recipients.map(email => ({
          to: [{ email }],
          subject: subject,
        })),
        from: {
          email: fromEmail,
          name: fromName,
        },
        content: [
          {
            type: 'text/html',
            value: emailBody,
          },
        ],
        reply_to: {
          email: fromEmail,
          name: fromName,
        },
        tracking_settings: {
          click_tracking: {
            enable: true,
          },
          open_tracking: {
            enable: true,
          },
        },
      }),
    });

    if (!sendgridResponse.ok) {
      const errorData = await sendgridResponse.text();
      throw new Error(`SendGrid error: ${sendgridResponse.status} - ${errorData}`);
    }

    // Log campaign in database
    await supabaseClient
      .from('marketing_campaigns')
      .insert({
        campaign_id,
        tenant_id,
        subject,
        recipient_count: recipients.length,
        sent_at: new Date().toISOString(),
        status: 'sent',
      })
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        message: `Campaign sent to ${recipients.length} recipients`,
        sent_count: recipients.length,
        campaign_id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending marketing email:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
