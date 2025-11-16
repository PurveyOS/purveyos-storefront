// supabase/functions/create-payment-intent/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

interface CreatePaymentIntentRequest {
  amount: number; // in cents
  currency?: string;
  order_id?: string;
  customer_email?: string;
  metadata?: Record<string, string>;
}

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!STRIPE_SECRET_KEY) {
      console.error('Missing STRIPE_SECRET_KEY environment variable');
      return new Response(
        JSON.stringify({ error: 'Payment processing not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const body: CreatePaymentIntentRequest = await req.json();

    if (!body.amount || body.amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'Valid amount is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Create Stripe PaymentIntent
    const stripeResponse = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'amount': body.amount.toString(),
        'currency': body.currency || 'usd',
        'metadata[order_id]': body.order_id || '',
        'metadata[customer_email]': body.customer_email || '',
        'metadata[source]': 'storefront',
        ...Object.entries(body.metadata || {}).reduce((acc, [key, value]) => {
          acc[`metadata[${key}]`] = value;
          return acc;
        }, {} as Record<string, string>),
      }),
    });

    if (!stripeResponse.ok) {
      const errorText = await stripeResponse.text();
      console.error('Stripe API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Payment processing failed' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const paymentIntent = await stripeResponse.json();

    return new Response(
      JSON.stringify({ 
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error creating payment intent:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});