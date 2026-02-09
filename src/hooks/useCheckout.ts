import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Cart } from '../types/storefront';
import type { Product } from '../types/product';

export interface GroupChoice {
  productId: string;
  quantity: number;
}

export interface SubscriptionRequest {
  enabled: boolean;
  cadence?: 'weekly' | 'biweekly' | 'monthly';
  startDate?: string; // ISO date
  isCsaBox?: boolean;
  targetWeightLbs?: number; // for weight-based items (CSA box), optional
  duration?: number; // number of deliveries
  substitutions?: Record<string, GroupChoice[]>; // { groupName: [{ productId, quantity }, ...] }

  // Optional extra fields to support product-specific subscriptions
  productId?: string;
  subscriptionProductId?: string; // subscription_products.id
  quantity?: number;
}

export interface CheckoutData {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethod: 'pickup' | 'delivery' | 'shipping' | 'dropoff' | 'other';
  deliveryAddress?: string;
  paymentMethod: 'venmo' | 'zelle' | 'cashapp' | 'card' | 'cash' | 'pay_later';
  paymentNowChoice?: 'pay_now' | 'pay_at_pickup';
  paymentDetails?: string; // Card token or payment confirmation
  deliveryNotes?: string;
  fulfillmentLocation?: string; // Selected pickup or dropoff location
  subscription?: SubscriptionRequest; // Legacy: single subscription
  subscriptions?: SubscriptionRequest[]; // New: multiple subscriptions
  discountCents?: number;
  shippingChargeCents?: number; // Shipping charge if applicable
}

export interface CheckoutResult {
  orderId?: string;
  clientSecret?: string | null;
  needsStripeConfirmation?: boolean;
  paymentPolicy?: string;
  paymentStatus?: string;
  authAmountCents?: number | null;
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
  // Subtotal is always the sum of line items BEFORE discount
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
    // No tax: total = subtotal - discount
    return {
      subtotalCents,
      taxCents: 0,
      totalCents: Math.max(0, subtotalCents - discountCents),
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
      totalCents: Math.max(0, gross - discountCents),
    };
  } else {
    // Prices are before tax: calculate tax on (subtotal - discount), then add to subtotal
    const subtotalAfterDiscount = Math.max(0, subtotalCents - discountCents);
    const taxCents = Math.round(subtotalAfterDiscount * rate);
    return {
      subtotalCents,
      taxCents,
      totalCents: subtotalAfterDiscount + taxCents,
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
  requestedWeightLbs?: number | null;
  lineType?: 'exact_package' | 'pack_for_you';
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
    console.log('🔧 [createOrder] Function called with:', {
      tenantId,
      cartItemsCount: cart.items?.length,
      productsCount: products?.length,
      checkoutData,
      taxConfig
    });

    setLoading(true);
    setError(null);

    try {
      if (!supabase) {
        console.error('❌ [createOrder] Supabase client not initialized');
        throw new Error('Supabase client not initialized');
      }

      if (!tenantId) {
        console.error('❌ [createOrder] Tenant ID is required');
        throw new Error('Tenant ID is required');
      }

      if (!cart.items || cart.items.length === 0) {
        console.error('❌ [createOrder] Cart is empty');
        throw new Error('Cart is empty');
      }

      // 1) Map cart items → unified line model
      console.log('📝 [createOrder] Mapping cart items to order lines...');
      const lines: OutgoingOrderLine[] = cart.items.map((item: any) => {
        console.log('  → Processing item:', { productId: item.productId, quantity: item.quantity, metadata: item.metadata });
        let product = products.find((p) => p.id === item.productId);

        // Allow subscription lines even if base product is not in products (e.g., not online)
        if (!product && item?.metadata?.isSubscription) {
          const meta = item.metadata || {};
          const subscriptionName = meta.subscriptionName || 'Subscription Box';
          const interval = meta.subscriptionInterval;

          product = {
            id: item.productId,
            name: subscriptionName,
            pricePer: meta.subscriptionTotalPrice || 0,
            unit: 'ea',
            pricingMode: 'fixed',
            allowPreOrder: false,
            subscriptionInterval: interval,
          } as any;
        }

        if (!product) {
          console.error('❌ [createOrder] Product not found:', item.productId);
          throw new Error(`Product not found: ${item.productId}`);
        }

        const quantity: number = item.quantity ?? 1;
        const binWeight: number | null =
          typeof item.binWeight === 'number' ? item.binWeight : null;
        const weightLbs: number | null =
          typeof item.weight === 'number' ? item.weight : null;
        const requestedWeightLbs: number | null =
          typeof (item as any).requestedWeightLbs === 'number' ? (item as any).requestedWeightLbs : null;
        const lineType: OutgoingOrderLine['lineType'] =
          (item as any).lineType === 'pack_for_you' ? 'pack_for_you' : 'exact_package';
        
        // Pre-order only when explicitly flagged on the cart item
        // (UI sets this when sold out + pre-order is allowed)
        const isPreOrder: boolean = !!item.isPreOrder;

        const pricingMode: 'weight' | 'fixed' | undefined = (product as any).pricingMode;

        let unitPrice: number; // dollars per lb or per item
        let lineTotal: number; // dollars

        if (binWeight && typeof item.unitPriceCents === 'number') {
          // Pre-packaged bin: per lb for weight items, per unit for EA variants
          unitPrice = item.unitPriceCents / 100;
          const isEach = ((product as any)?.unit || '').toLowerCase() === 'ea' || Boolean((product as any)?.variantSize || (product as any)?.variantUnit);
          lineTotal = isEach ? (unitPrice * quantity) : (unitPrice * binWeight * quantity);
        } else if (lineType === 'pack_for_you' && requestedWeightLbs) {
          // Pack-for-you estimated weight
          unitPrice = (product as any).pricePer;
          lineTotal = unitPrice * requestedWeightLbs * quantity;
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
          requestedWeightLbs,
          lineType,
          isPreOrder,
          pricePer: pricePerLabel,
        };
      });

      console.log('✅ [createOrder] Mapped lines:', lines);

      // 2) Compute subtotal / tax / total in cents using tenant-aware tax settings
      const discountCents = checkoutData.discountCents || 0;
      const shippingChargeCents = checkoutData.shippingChargeCents || 0;
      
      console.log('💰 [createOrder] Calculating totals:', { discountCents, shippingChargeCents, taxConfig });
      
      const totals = calculateTotalsFromCents(
        lines.map((line) => line.lineTotalCents),
        taxConfig,
        discountCents
      );

      const subtotalCents = totals.subtotalCents;
      const taxCents = totals.taxCents;
      // Add shipping charge to the final total
      const totalCents = totals.totalCents + shippingChargeCents;

      console.log('💰 [createOrder] Calculated totals:', { subtotalCents, taxCents, totalCents, shippingChargeCents });

      // 2.5) Derive subscription payload from cart metadata if not provided
      const subscriptionFromCart = cart.items.find((item: any) => item?.metadata?.isSubscription);
      const derivedSubscription: SubscriptionRequest | undefined = subscriptionFromCart
        ? {
            enabled: true,
            cadence: subscriptionFromCart.metadata?.subscriptionInterval,
            startDate: new Date().toISOString(),
            productId: subscriptionFromCart.metadata?.subscriptionProductId ?? subscriptionFromCart.productId,
            subscriptionProductId: subscriptionFromCart.metadata?.subscriptionProductId,
            quantity: subscriptionFromCart.quantity ?? 1,
            substitutions: subscriptionFromCart.metadata?.substitutionSelections,
            duration: subscriptionFromCart.metadata?.subscriptionDurationIntervals,
          }
        : undefined;

      const subscriptionPayload: SubscriptionRequest | undefined = checkoutData.subscription
        ? { ...checkoutData.subscription, enabled: checkoutData.subscription.enabled ?? true }
        : derivedSubscription;

      // 3) Call Edge Function to create order securely (bypasses RLS)
      const edgeFunctionPayload = {
        tenantId,
        customerName: checkoutData.customerName,
        customerEmail: checkoutData.customerEmail,
        customerPhone: checkoutData.customerPhone,
        deliveryMethod: checkoutData.deliveryMethod,
        deliveryAddress: checkoutData.deliveryAddress,
        deliveryNotes: checkoutData.deliveryNotes,
        paymentMethod: checkoutData.paymentMethod,
        paymentNowChoice: checkoutData.paymentNowChoice,
        fulfillmentLocation: checkoutData.fulfillmentLocation,

        // Canonical line structure
        lines,
        subtotalCents,
        taxCents,
        totalCents,
        discountCents,
        shippingChargeCents,

        // Optional subscription payload (for storefront_subscriptions)
        subscription: subscriptionPayload,
      };

      console.log('🚀 [createOrder] Calling Edge Function with payload:', edgeFunctionPayload);

      const { data, error: functionError } = await supabase.functions.invoke(
        'create-storefront-order',
        {
          body: edgeFunctionPayload,
        }
      );

      console.log('📨 [createOrder] Edge Function response:', { data, error: functionError });

      if (functionError) {
        console.error('❌ [createOrder] Edge Function returned error:', functionError);
        throw functionError;
      }

      if (!(data as any)?.success) {
        console.error('❌ [createOrder] Order creation failed:', (data as any)?.error);
        throw new Error((data as any)?.error || 'Failed to create order');
      }

      const orderId = (data as any)?.order_id ?? (data as any)?.orderId;

      console.log('✅ [createOrder] Order created successfully:', orderId);

      return {
        success: true,
        orderId,
        clientSecret: (data as any)?.client_secret ?? null,
        needsStripeConfirmation: (data as any)?.needs_stripe_confirmation ?? false,
        paymentPolicy: (data as any)?.payment_policy,
        paymentStatus: (data as any)?.payment_status,
        authAmountCents: (data as any)?.auth_amount_cents ?? null,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to create order';
      console.error('❌ [createOrder] Caught exception:', { err, errorMessage });
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      console.log('🏁 [createOrder] Function complete');
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
