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

export interface TenantTaxConfig {
  taxRate?: number;              // e.g. 0.0825 for 8.25%
  taxIncluded?: boolean;         // true if prices already include tax
  chargeTaxOnOnline?: boolean;   // allow disabling tax for online orders
}

/**
 * Compute subtotal/tax/total in cents from line totals and tenant tax config.
 */
function calculateTotalsFromCents(
  lineTotalsCents: number[],
  taxConfig?: TenantTaxConfig
) {
  const subtotalCents = lineTotalsCents.reduce(
    (sum, cents) => sum + (cents || 0),
    0
  );

  const rate = taxConfig?.taxRate ?? 0;
  const chargeTax =
    taxConfig?.chargeTaxOnOnline !== undefined
      ? taxConfig.chargeTaxOnOnline
      : true;

  if (!chargeTax || rate <= 0) {
    return {
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
    };
  }

  const taxIncluded = !!taxConfig?.taxIncluded;

  if (taxIncluded) {
    // Prices already include tax: back out the net subtotal.
    const gross = subtotalCents;
    const net = Math.round(gross / (1 + rate));
    const taxCents = gross - net;

    return {
      subtotalCents: net,
      taxCents,
      totalCents: gross,
    };
  } else {
    // Prices are before tax: add tax on top.
    const taxCents = Math.round(subtotalCents * rate);
    return {
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
    };
  }
}

export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = async (
    tenantId: string,
    cart: Cart,
    products: Product[],
    checkoutData: CheckoutData,
    taxConfig?: TenantTaxConfig
  ): Promise<CheckoutResult> => {
    setLoading(true);
    setError(null);

    try {
      if (!supabase) {
        throw new Error('Supabase client not configured');
      }

      // 1) Calculate order line totals
      const lines = cart.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        let unitPrice = product.pricePer;
        let lineTotalCents = 0;

        if (item.binWeight && item.unitPriceCents) {
          // Pre-packed bin: unitPriceCents is per lb, multiply by bin size
          unitPrice = item.binWeight * (item.unitPriceCents / 100);
          lineTotalCents = Math.round(unitPrice * item.quantity * 100);
        } else {
          // Simple fixed/weight price: pricePer * quantity
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

      // 2) Compute subtotal / tax / total in cents using tenant tax config
      const { subtotalCents, taxCents, totalCents } = calculateTotalsFromCents(
        lines.map(line => line.lineTotalCents),
        taxConfig
      );

      // 3) Call Edge Function to create order securely (bypasses RLS)
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
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create order';
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
