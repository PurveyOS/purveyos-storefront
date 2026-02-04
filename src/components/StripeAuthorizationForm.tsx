import React, { useState } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

interface StripeAuthorizationFormProps {
  orderId: string;
  onAuthorized: (paymentIntentId?: string) => void;
  onError: (message: string) => void;
}

export function StripeAuthorizationForm({
  orderId,
  onAuthorized,
  onError,
}: StripeAuthorizationFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const markOrderAuthorized = async (paymentIntentId: string) => {
    const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = import.meta.env

    if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
      throw new Error('Supabase environment variables not configured')
    }

    const response = await fetch(`${VITE_SUPABASE_URL}/functions/v1/mark-storefront-order-authorized`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VITE_SUPABASE_ANON_KEY}`,
        'apikey': VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId,
        paymentIntentId,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      const message = errorBody?.message || errorBody?.error || 'Failed to mark order authorized'
      throw new Error(message)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?order_id=${orderId}`,
      },
      redirect: 'if_required',
    });

    if (error) {
      onError(error.message || 'Payment authorization failed');
      setSubmitting(false);
      return;
    }

    if (paymentIntent && ['requires_capture', 'processing', 'requires_action'].includes(paymentIntent.status)) {
      try {
        await markOrderAuthorized(paymentIntent.id)
        onAuthorized(paymentIntent.id)
        setSubmitting(false)
        return
      } catch (markError: any) {
        onError(markError.message || 'Failed to mark order authorized')
        setSubmitting(false)
        return
      }
    }

    if (paymentIntent?.status === 'succeeded') {
      // For safety: should not happen with manual capture, but treat as authorized
      try {
        await markOrderAuthorized(paymentIntent.id)
        onAuthorized(paymentIntent.id)
        setSubmitting(false)
        return
      } catch (markError: any) {
        onError(markError.message || 'Failed to mark order authorized')
        setSubmitting(false)
        return
      }
    }

    onError('Payment authorization incomplete. Please try again.');
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full px-4 py-3 rounded-lg text-white font-medium transition-all duration-200 disabled:opacity-60"
        style={{ backgroundColor: '#0f6fff' }}
      >
        {submitting ? 'Authorizing...' : 'Authorize Payment'}
      </button>
    </form>
  );
}
