import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Cart } from '../types/storefront';
import type { Product } from '../types/product';

export interface SubscriptionRequest {
  enabled: boolean;
  cadence?: 'weekly' | 'biweekly' | 'monthly';
  startDate?: string; // ISO date
  isCsaBox?: boolean;
  targetWeightLbs?: number; // for weight-based items (CSA box), optional

  // Optional extra fields to support product-specific subscriptions
  productId?: string;
  subscriptionProductId?: string; // subscription_products.id
  quantity?: number;
}

export interface CheckoutData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethod: 'pickup' | 'delivery';
  deliveryAddress?: string;
  paymentMethod: 'venmo' | 'zelle' | 'card' | 'cash';
  paymentDetails?: string; // Card token or payment confirmation
  deliveryNotes?: string;
  subscription?: SubscriptionRequest;
  discountCents?: number;
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

interface TotalsResult {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

function calculateTotalsFromCents(
  lineTotalsCents: number[],
  taxConfig?: TenantTaxConfig,
  discountCents: number = 0
): TotalsResult {
  const grossSubtotalCents = lineTotalsCents.reduce(
    (sum, cents) => sum + (cents || 0),
    0
  );
  
  // Apply discount to subtotal
  const subtotalCents = Math.max(0, grossSubtotalCents - discountCents);

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

  const taxIncluded = taxConfig?.taxIncluded ?? false;

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

interface OutgoingOrderLine {
  productId: string;
  productName: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  binWeight?: number | null;
  weightLbs?: number | null;
  isPreOrder?: boolean;
  pricePer?: 'weight' | 'fixed' | 'unit' | 'lb' | string;
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
        throw new Error('Supabase client not initialized');
      }

      if (!tenantId) {
        throw new Error('Tenant ID is required');
      }

      if (!cart.items || cart.items.length === 0) {
        throw new Error('Cart is empty');
      }

      // 1) Map cart items → unified line model
      const lines: OutgoingOrderLine[] = cart.items.map((item: any) => {
        const product = products.find((p) => p.id === item.productId);
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        const quantity: number = item.quantity ?? 1;
        const binWeight: number | null =
          typeof item.binWeight === 'number' ? item.binWeight : null;
        const weightLbs: number | null =
          typeof item.weight === 'number' ? item.weight : null;
        const isPreOrder: boolean = !!item.isPreOrder;

        const pricingMode: 'weight' | 'fixed' | undefined = (product as any).pricingMode;

        let unitPrice: number; // dollars per lb or per item
        let lineTotal: number; // dollars

        if (binWeight && typeof item.unitPriceCents === 'number') {
          // Pre-packaged bin: unitPriceCents is per lb; apply to bin weight
          unitPrice = item.unitPriceCents / 100;
          lineTotal = unitPrice * binWeight * quantity;
        } else if (weightLbs) {
          // Weight-based pricing (by lb) - for pre-orders or custom weight
          unitPrice = (product as any).pricePer;
          lineTotal = unitPrice * weightLbs * quantity;
        } else if (pricingMode === 'weight') {
          // Weight mode but no weight specified - this shouldn't happen, but default to pricePer
          unitPrice = (product as any).pricePer;
          lineTotal = unitPrice * quantity;
        } else {
          // Fixed price item (sold by unit count, not weight)
          unitPrice = (product as any).pricePer;
          lineTotal = unitPrice * quantity;
        }

        const unitPriceCents = Math.round(unitPrice * 100);
        const lineTotalCents = Math.round(lineTotal * 100);

        console.log('🛒 Cart item calculation:', {
          productName: (product as any).name,
          pricingMode,
          quantity,
          binWeight,
          weightLbs,
          isPreOrder,
          productPricePer: (product as any).pricePer,
          itemUnitPriceCents: item.unitPriceCents,
          calculatedUnitPrice: unitPrice,
          calculatedLineTotal: lineTotal,
          unitPriceCents,
          lineTotalCents
        });

        const pricePerLabel: OutgoingOrderLine['pricePer'] =
          pricingMode === 'weight' ? 'lb' : 'unit';

        return {
          productId: item.productId,
          productName: (product as any).name ?? (product as any).productName ?? '',
          qty: quantity,
          unitPriceCents,
          lineTotalCents,
          binWeight,
          weightLbs,
          isPreOrder,
          pricePer: pricePerLabel,
        };
      });

      // 2) Compute subtotal / tax / total in cents using tenant-aware tax settings
      const discountCents = checkoutData.discountCents || 0;
      const totals = calculateTotalsFromCents(
        lines.map((line) => line.lineTotalCents),
        taxConfig,
        discountCents
      );

      const subtotalCents = totals.subtotalCents;
      const taxCents = totals.taxCents;
      const totalCents = totals.totalCents;

      // 3) Call Edge Function to create order securely (bypasses RLS)
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

            // Canonical line structure
            lines,
            subtotalCents,
            taxCents,
            totalCents,
            discountCents,

            // Optional subscription payload (for storefront_subscriptions)
            subscription: checkoutData.subscription,
          },
        }
      );

      if (functionError) {
        throw functionError;
      }

      if (!(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to create order');
      }

      return {
        success: true,
        orderId: (data as any).orderId,
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
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      if (!cardToken) {
        throw new Error('Missing card token');
      }

      if (!amount || amount <= 0) {
        throw new Error('Amount must be greater than zero');
      }

      // Call edge function to process payment via Stripe
      const { data, error } = await supabase.functions.invoke(
        'process-payment',
        {
          body: {
            amount: Math.round(amount * 100), // dollars → cents
            payment_method: cardToken,
            connected_account_id: connectedAccountId,
            currency: 'usd',
          },
        }
      );

      if (error) {
        throw error;
      }

      return {
        success: true,
        paymentIntentId: (data as any)?.paymentIntentId,
      };
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : 'Payment processing failed',
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
