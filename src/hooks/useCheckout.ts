import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Cart } from '../types/storefront';
import type { Product } from '../types/product';

export interface CheckoutData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethod: 'pickup' | 'delivery';
  deliveryAddress?: string;
   paymentMethod: 'venmo' | 'zelle' | 'card' | 'cash';
  paymentDetails?: string; // Card token or payment confirmation
   deliveryNotes?: string;
}

export interface CheckoutResult {
  orderId?: string;
  success: boolean;
  error?: string;
}

export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = async (
    tenantId: string,
    cart: Cart,
    products: Product[],
    checkoutData: CheckoutData
  ): Promise<CheckoutResult> => {
    setLoading(true);
    setError(null);

    try {
      if (!supabase) {
         throw new Error('Supabase client not configured');
      }

       // Calculate order totals and build line items
       const lines = cart.items.map(item => {
        const product = products.find(p => p.id === item.productId);
         if (!product) throw new Error(`Product not found: ${item.productId}`);
        
         let unitPrice = product.pricePer;
         let lineTotalCents = 0;
       
        if (item.binWeight && item.unitPriceCents) {
           unitPrice = item.binWeight * (item.unitPriceCents / 100);
           lineTotalCents = Math.round(unitPrice * item.quantity * 100);
         } else {
           lineTotalCents = Math.round(unitPrice * item.quantity * 100);
        }
        
         return {
           productId: item.productId,
           qty: item.quantity,
           unitPrice,
           lineTotalCents,
           binWeight: item.binWeight,
           unitPriceCents: item.unitPriceCents,
         };
       });

       const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
       const taxCents = Math.round(subtotalCents * 0.08); // 8% tax
       const totalCents = subtotalCents + taxCents;

       // Call Edge Function to create order securely (bypasses RLS)
       console.log('Calling create-storefront-order Edge Function...');
       const { data, error: functionError } = await supabase.functions.invoke(
         'create-storefront-order',
         {
           body: {
             tenantId,
             customerName: checkoutData.customerName,
             customerEmail: checkoutData.customerEmail,
             customerPhone: checkoutData.customerPhone,
             deliveryMethod: checkoutData.deliveryMethod,
             deliveryAddress: checkoutData.deliveryAddress,
             deliveryNotes: checkoutData.deliveryNotes,
             paymentMethod: checkoutData.paymentMethod,
             lines,
             subtotalCents,
             taxCents,
             totalCents,
           },
         }
       );

       if (functionError) {
         console.error('Edge Function error:', functionError);
         throw functionError;
       }

       if (!data?.success) {
         throw new Error(data?.error || 'Failed to create order');
       }

       console.log('Order created successfully:', data.orderId);

      return {
        success: true,
         orderId: data.orderId,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create order';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setLoading(false);
    }
  };

  const processCardPayment = async (
    amount: number,
    cardToken: string,
    connectedAccountId: string
  ): Promise<{ success: boolean; error?: string; paymentIntentId?: string }> => {
    try {
      // If Supabase is not configured, simulate success
      if (!supabase) {
        console.log('Supabase not configured, simulating card payment');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          success: true,
          paymentIntentId: 'mock-pi-' + Date.now(),
        };
      }

      // Call edge function to process payment via Stripe
      const { data, error } = await supabase.functions.invoke('process-payment', {
        body: {
          amount: Math.round(amount * 100), // Convert to cents
          payment_method: cardToken,
          connected_account_id: connectedAccountId,
          currency: 'usd',
        },
      });

      if (error) throw error;

      return {
        success: data.success,
        paymentIntentId: data.payment_intent_id,
        error: data.error,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Payment processing failed',
      };
    }
  };

  return {
    createOrder,
    processCardPayment,
    loading,
    error,
  };
}