import React, { forwardRef, useImperativeHandle } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

export interface StripeCardFormHandle {
  getConfirmationToken: () => Promise<string>;
}

export const StripeInlineCardForm = forwardRef<StripeCardFormHandle>((_, ref) => {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    getConfirmationToken: async () => {
      if (!stripe || !elements) throw new Error('Stripe not loaded');

      // Validate the form fields
      const { error: submitError } = await elements.submit();
      if (submitError) throw new Error(submitError.message || 'Please check your card details');

      // Tokenize the card without charging
      const { confirmationToken, error } = await stripe.createConfirmationToken({ elements });
      if (error) throw new Error(error.message || 'Failed to process card details');
      if (!confirmationToken) throw new Error('Failed to tokenize card');

      return confirmationToken.id;
    },
  }));

  return (
    <div className="mt-4">
      <PaymentElement />
    </div>
  );
});

StripeInlineCardForm.displayName = 'StripeInlineCardForm';
