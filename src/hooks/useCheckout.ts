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
  requestedDeliveryDate?: string;
  paymentMethod: 'venmo' | 'zelle' | 'cashapp' | 'card' | 'cash' | 'pay_later';
  paymentNowChoice?: 'pay_now' | 'pay_at_pickup';
  paymentDetails?: string; // Card token or payment confirmation
  deliveryNotes?: string;
  fulfillmentLocation?: string; // Selected pickup or dropoff location
  subscription?: SubscriptionRequest; // Legacy: single subscription
  subscriptions?: SubscriptionRequest[]; // New: multiple subscriptions
  discountCents?: number;
  shippingChargeCents?: number; // Shipping charge if applicable
  shippingEstimateHighCents?: number; // Max shipping estimate shown to customer
  deliveryChargeCents?: number; // Delivery charge if applicable
  onlinePaymentFeeCents?: number; // Online convenience fee when applicable
  depositChargeCents?: number; // Amount to collect now for deposit orders
  customerZip?: string;
  customerStreet?: string;
  customerCity?: string;
  customerState?: string;
  confirmationToken?: string; // Stripe ConfirmationToken ID (card pre-tokenized inline)
  paymentMethodId?: string;   // Stripe PaymentMethod ID (card pre-tokenized via CardElement)
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

type ProductTaxBehavior = 'inherit' | 'taxable' | 'exempt';

function isProductTaxable(product: any, chargeTaxOnOnline: boolean): boolean {
  const behavior = ((product?.taxBehavior ?? product?.tax_behavior ?? 'exempt') as ProductTaxBehavior);
  if (behavior === 'taxable') return true;
  if (behavior === 'exempt') return false;
  return chargeTaxOnOnline;
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

interface FunctionShortage {
  productId?: string;
  productName?: string;
  requestedQty?: number;
  requestedWeightLbs?: number | null;
  binWeight?: number | null;
  weightLbs?: number | null;
  lineType?: 'exact_package' | 'pack_for_you';
  available?: number;
}

function formatShortageLine(shortage: FunctionShortage, lines: OutgoingOrderLine[]): string {
  const requestedWeight =
    Number(shortage.requestedWeightLbs ?? shortage.weightLbs ?? shortage.binWeight ?? 0) || 0;
  const requestedQty = Math.max(1, Number(shortage.requestedQty ?? 1) || 1);

  const matchedLine = lines.find((line) => {
    if (line.productId !== shortage.productId) return false;

    const shortageBinWeight = shortage.binWeight ?? null;
    if (shortageBinWeight === null || shortageBinWeight === undefined) return true;

    return Number(line.binWeight ?? line.weightLbs ?? line.requestedWeightLbs ?? 0) === Number(shortageBinWeight);
  });

  const label = shortage.productName || matchedLine?.productName || 'Selected item';
  const available = Math.max(0, Number(shortage.available ?? 0));

  if (requestedWeight > 0) {
    return `${label} (${requestedWeight.toFixed(2)} lb package, qty ${requestedQty}) - available now: ${available.toFixed(2)} lb`;
  }

  return `${label} (qty ${requestedQty}) - available now: ${available}`;
}

function buildOutOfStockMessage(payload: any, lines: OutgoingOrderLine[]): string | null {
  const shortages: FunctionShortage[] = Array.isArray(payload?.shortages) ? payload.shortages : [];
  if (shortages.length === 0) return null;

  const details = shortages.map((shortage) => `- ${formatShortageLine(shortage, lines)}`);
  return `Some selected packages are no longer available. Remove or adjust these items:\n${details.join('\n')}`;
}

export function useCheckout() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readFunctionErrorDetails = async (invokeError: any): Promise<{ message: string | null; payload: any }> => {
    try {
      const context = invokeError?.context;
      if (context?.json) {
        const payload = await context.json();
        if (typeof payload?.error === 'string' && payload.error) {
          return { message: payload.error, payload };
        }
        if (typeof payload?.message === 'string' && payload.message) {
          return { message: payload.message, payload };
        }
        if (typeof payload === 'string' && payload) {
          return { message: payload, payload: null };
        }
        return { message: null, payload };
      }
      if (context?.text) {
        const textPayload = await context.text();
        if (!textPayload) return { message: null, payload: null };
        try {
          const parsed = JSON.parse(textPayload);
          if (typeof parsed?.error === 'string' && parsed.error) {
            return { message: parsed.error, payload: parsed };
          }
          if (typeof parsed?.message === 'string' && parsed.message) {
            return { message: parsed.message, payload: parsed };
          }
          return { message: null, payload: parsed };
        } catch {
          return { message: textPayload, payload: null };
        }
      }
    } catch {
      // Fall through to final message-based checks below.
    }

    if (typeof invokeError?.message === 'string' && invokeError.message) {
      return { message: invokeError.message, payload: null };
    }

    return { message: null, payload: null };
  };
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
            taxBehavior: 'inherit',
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
        const rawWeightLbs: number | null =
          typeof item.weight === 'number' ? item.weight : null;

        // Pre-order only when explicitly flagged on the cart item
        // (UI sets this when sold out + pre-order is allowed)
        const isPreOrder: boolean = !!item.isPreOrder;
        const productUnit = String((product as any).unit ?? '').toLowerCase();
        const isWeightProduct = productUnit.startsWith('lb');
        const rawRequestedWeightLbs: number | null =
          typeof (item as any).requestedWeightLbs === 'number' ? (item as any).requestedWeightLbs : null;
        const shouldCanonicalizePreOrderWeight =
          isPreOrder &&
          isWeightProduct &&
          !binWeight &&
          rawRequestedWeightLbs == null &&
          rawWeightLbs != null &&
          rawWeightLbs > 0;
        const requestedWeightLbs: number | null =
          rawRequestedWeightLbs ?? (shouldCanonicalizePreOrderWeight ? rawWeightLbs : null);
        const lineType: OutgoingOrderLine['lineType'] =
          (item as any).lineType === 'pack_for_you' || shouldCanonicalizePreOrderWeight
            ? 'pack_for_you'
            : 'exact_package';
        const weightLbs: number | null = lineType === 'pack_for_you' ? null : rawWeightLbs;

        const pricingMode: 'weight' | 'fixed' | undefined = (product as any).pricingMode;
        const isDepositProduct = Boolean((product as any).is_deposit_product);
        const depositFixedTotal = Number((product as any).deposit_fixed_total ?? 0);

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

        // Fixed-price deposit products use the configured final total for order value.
        if (isDepositProduct && depositFixedTotal > 0) {
          unitPrice = depositFixedTotal;
          lineTotal = depositFixedTotal * quantity;
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
      const deliveryChargeCents = checkoutData.deliveryChargeCents || 0;
      const onlinePaymentFeeCents = Math.max(0, Math.round(checkoutData.onlinePaymentFeeCents || 0));

      console.log('💰 [createOrder] Calculating totals:', { discountCents, shippingChargeCents, deliveryChargeCents, taxConfig });

      const subtotalCents = lines.reduce((sum, line) => sum + (line.lineTotalCents || 0), 0);
      const chargeTax = taxConfig?.chargeTaxOnOnline !== false;
      const taxIncluded = taxConfig?.taxIncluded ?? false;
      const taxRate = taxConfig?.taxRate ?? 0;
      const productById = new Map(products.map((product) => [product.id, product]));
      const taxableSubtotalCents = lines.reduce((sum, line) => {
        const product = productById.get(line.productId);
        if (!isProductTaxable(product, chargeTax)) return sum;
        return sum + (line.lineTotalCents || 0);
      }, 0);

      let taxCents = 0;
      if (chargeTax && !taxIncluded && taxRate > 0) {
        const subtotalAfterDiscountCents = Math.max(0, subtotalCents - discountCents);
        const discountRatio = subtotalCents > 0
          ? Math.min(1, subtotalAfterDiscountCents / subtotalCents)
          : 0;
        const taxableAfterDiscountCents = Math.max(0, Math.round(taxableSubtotalCents * discountRatio));
        taxCents = Math.round(taxableAfterDiscountCents * taxRate);
      }

      // Add shipping/delivery charge to the final total
      const totalCents = Math.max(0, subtotalCents - discountCents) + taxCents + shippingChargeCents + deliveryChargeCents + onlinePaymentFeeCents;

      const depositChargeCents = checkoutData.depositChargeCents ?? cart.items.reduce((sum, item: any) => {
        const product = products.find((p) => p.id === item.productId) as any;
        if (!product || !product.is_deposit_product) return sum;
        const qty = item.quantity ?? 1;
        const depositNow = Math.round((Number(product.pricePer) || 0) * 100) * qty;
        return sum + depositNow;
      }, 0);

      console.log('💰 [createOrder] Calculated totals:', {
        subtotalCents,
        taxCents,
        totalCents,
        shippingChargeCents,
        deliveryChargeCents,
        onlinePaymentFeeCents,
      });

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
            substitutions: (subscriptionFromCart.metadata as any)?.substitutionSelections,
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
        requestedDeliveryDate: checkoutData.requestedDeliveryDate,
        deliveryNotes: checkoutData.deliveryNotes,
        paymentMethod: checkoutData.paymentMethod,
        paymentNowChoice: checkoutData.paymentNowChoice,
        fulfillmentLocation: checkoutData.fulfillmentLocation,
        checkoutAttemptId: crypto.randomUUID(),

        // Canonical line structure
        lines,
        subtotalCents,
        taxCents,
        totalCents,
        discountCents,
        shippingChargeCents,
        shippingEstimateHighCents: checkoutData.shippingEstimateHighCents ?? null,
        deliveryChargeCents,
        onlinePaymentFeeCents,
        depositChargeCents,

        // Optional subscription payload (for storefront_subscriptions)
        subscription: subscriptionPayload,
        // Pre-tokenized card (inline Stripe form)
        confirmationToken: checkoutData.confirmationToken,
        paymentMethodId: checkoutData.paymentMethodId,
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
        const { message: parsedFunctionMessage, payload: functionPayload } = await readFunctionErrorDetails(functionError);
        const functionMessage = parsedFunctionMessage || '';
        if (functionMessage.includes('delivery_date_capacity_reached')) {
          throw new Error('That delivery date is full. Please choose another date.');
        }
        if (functionMessage.includes('delivery_date_in_past')) {
          throw new Error('Please choose a future delivery date.');
        }
        if (functionMessage.includes('delivery_date_outside_window')) {
          throw new Error('That delivery date is outside the booking window. Please choose another date.');
        }
        if (functionMessage.includes('delivery_date_not_allowed')) {
          throw new Error('That date is not part of this store\'s delivery schedule. Please choose another date.');
        }
        if (functionMessage.includes('delivery_date_before_lead_time')) {
          throw new Error('That date is too soon for this store\'s lead time. Please choose a later date.');
        }
        if (functionMessage.includes('requested_delivery_date_invalid')) {
          throw new Error('Please choose a valid delivery date.');
        }
        if (functionMessage.includes('deposit_requires_pay_now')) {
          throw new Error('Deposit items require payment at checkout by card, Venmo, or Zelle.');
        }
        if (functionMessage.includes('deposit_pricing_mode_conflict')) {
          throw new Error('This deposit item has conflicting pricing settings. Please contact the store to fix product setup.');
        }
        if (functionMessage.includes('out_of_stock')) {
          const detailedOutOfStockMessage = buildOutOfStockMessage(functionPayload, lines);
          throw new Error(detailedOutOfStockMessage || 'One or more items are no longer in stock. Please refresh your cart and try again.');
        }
        if (functionMessage.includes('card_payment_method_required')) {
          throw new Error('Card details were not captured. Please re-enter your card and try again.');
        }
        if (functionMessage.includes('card_authentication_required')) {
          throw new Error('Your card requires additional authentication. Please try again and complete verification.');
        }
        if (functionMessage.includes('card_payment_failed')) {
          throw new Error('Card payment failed. Please check your card details or use a different payment method.');
        }
        if (functionMessage.includes('stripe_account_not_connected')) {
          throw new Error('This store is not configured for card payments yet. Please choose another payment method.');
        }
        if (functionMessage.includes('payment_processing_not_configured')) {
          throw new Error('Card payment processing is temporarily unavailable. Please choose another payment method.');
        }

        // Fallback when Supabase error body cannot be parsed from context.
        if (
          checkoutData.depositChargeCents &&
          checkoutData.depositChargeCents > 0 &&
          (
            !['card', 'venmo', 'zelle'].includes((checkoutData.paymentMethod || '').toLowerCase()) ||
            (checkoutData.paymentMethod === 'card' && checkoutData.paymentNowChoice === 'pay_at_pickup')
          )
        ) {
          throw new Error('Deposit products must be paid at checkout by card, Venmo, or Zelle. Pay later is not available for these items.');
        }

        throw functionError;
      }

      if (!(data as any)?.success) {
        console.error('❌ [createOrder] Order creation failed:', (data as any)?.error);
        if ((data as any)?.error === 'out_of_stock') {
          const detailedOutOfStockMessage = buildOutOfStockMessage(data, lines);
          throw new Error(detailedOutOfStockMessage || 'One or more items are no longer in stock. Please refresh your cart and try again.');
        }
        throw new Error((data as any)?.error || 'Failed to create order');
      }

      const orderId = (data as any)?.order_id ?? (data as any)?.orderId;

      console.log('✅ [createOrder] Order created successfully:', orderId);

      return {
        success: true,
        orderId,
        clientSecret: (data as any)?.client_secret ?? (data as any)?.clientSecret ?? null,
        needsStripeConfirmation: (data as any)?.needs_stripe_confirmation ?? (data as any)?.needsStripeConfirmation ?? false,
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
