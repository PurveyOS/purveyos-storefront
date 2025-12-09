import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

// deno-lint-ignore no-explicit-any
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LineItem {
  price_data?: {
    currency: string;
    product_data: {
      name: string;
      description?: string;
    };
    unit_amount: number;
  };
  quantity: number;
}

interface CreateCheckoutRequest {
  mode: 'payment' | 'subscription';
  lineItems: LineItem[];
  tenantId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, any>;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: CreateCheckoutRequest = await req.json()

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    console.log('📝 Creating checkout session with metadata:', body.metadata)

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: body.mode,
      line_items: body.lineItems,
      success_url: body.successUrl,
      cancel_url: body.cancelUrl,
      customer_email: body.customerEmail,
      metadata: {
        tenant_id: body.tenantId,
        source: 'storefront',
        // Pass through all metadata including discount_cents
        ...body.metadata,
      },
    })

    console.log('✅ Checkout session created:', session.id)
    console.log('📋 Session metadata:', session.metadata)

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('❌ Checkout creation error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
