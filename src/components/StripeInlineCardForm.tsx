import { forwardRef, useImperativeHandle } from 'react';
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js';

export interface StripeCardFormHandle {
  getPaymentMethodId: () => Promise<string>;
}

export const StripeInlineCardForm = forwardRef<StripeCardFormHandle>((_, ref) => {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    getPaymentMethodId: async () => {
      if (!stripe || !elements) throw new Error('Stripe not loaded');

      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Card element not found');

      const { paymentMethod, error } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (error) throw new Error(error.message || 'Failed to process card details');
      if (!paymentMethod) throw new Error('Failed to tokenize card');

      return paymentMethod.id;
    },
  }));

  return (
    <div className="mt-2 p-3 border border-gray-300 rounded-lg">
      <CardElement
        options={{
          style: {
            base: {
              fontSize: '16px',
              color: '#374151',
              '::placeholder': { color: '#9CA3AF' },
            },
            invalid: { color: '#EF4444' },
          },
          hidePostalCode: false,
        }}
      />
    </div>
  );
});

StripeInlineCardForm.displayName = 'StripeInlineCardForm';
