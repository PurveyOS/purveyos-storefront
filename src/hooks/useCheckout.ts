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
  paymentMethod: 'pay-later' | 'card';
  paymentDetails?: string; // Card token or payment confirmation
  specialInstructions?: string;
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
      // If Supabase is not configured, simulate success
      if (!supabase) {
        console.log('Supabase not configured, simulating order creation');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
          success: true,
          orderId: 'mock-order-' + Date.now(),
        };
      }

      // Calculate order totals
      const subtotal = cart.items.reduce((sum, item) => {
        const product = products.find(p => p.id === item.productId);
        if (!product) return sum;
        
        if (item.binWeight && item.unitPriceCents) {
          const linePrice = (item.binWeight * (item.unitPriceCents / 100)) * item.quantity;
          return sum + linePrice;
        }
        
        return sum + (product.pricePer * item.quantity);
      }, 0);

      const tax = subtotal * 0.08; // 8% tax - this should be configurable
      const total = subtotal + tax;

      // Create the order record
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          tenant_id: tenantId,
          customer_name: checkoutData.customerName,
          customer_email: checkoutData.customerEmail,
          customer_phone: checkoutData.customerPhone,
          delivery_method: checkoutData.deliveryMethod,
          delivery_address: checkoutData.deliveryAddress,
          payment_method: checkoutData.paymentMethod,
          payment_details: checkoutData.paymentDetails,
          special_instructions: checkoutData.specialInstructions,
          subtotal,
          tax,
          total,
          status: 'pending',
          order_source: 'online',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      const orderId = orderData.id;

      // Create order line items
      const orderLines = cart.items.map(item => {
        const product = products.find(p => p.id === item.productId);
        if (!product) throw new Error(`Product not found: ${item.productId}`);

        const pricePerUnit = item.binWeight && item.unitPriceCents
          ? (item.binWeight * (item.unitPriceCents / 100))
          : product.pricePer;

        return {
          order_id: orderId,
          product_id: item.productId,
          quantity: item.quantity,
          price_per: pricePerUnit,
          bin_weight: item.binWeight || null,
          unit_price_cents: item.unitPriceCents || null,
          tenant_id: tenantId,
          created_at: new Date().toISOString(),
        };
      });

      const { error: linesError } = await supabase
        .from('order_lines')
        .insert(orderLines);

      if (linesError) throw linesError;

      // Call edge function to send notification to tenant
      try {
        await supabase.functions.invoke('send-order-notification', {
          body: {
            tenant_id: tenantId,
            order_id: orderId,
            customer_name: checkoutData.customerName,
            total,
          },
        });
      } catch (notificationError) {
        // Don't fail the order if notification fails
        console.warn('Failed to send order notification:', notificationError);
      }

      return {
        success: true,
        orderId,
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