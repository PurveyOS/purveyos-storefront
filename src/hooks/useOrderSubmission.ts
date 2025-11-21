import { supabase } from '../lib/supabaseClient';
import type { CartItem } from '../types/storefront';

export interface CustomerInfo {
  name: string;
  email: string;
  phone?: string;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
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

/**
 * Given an array of line totals in cents, and a tenant tax configuration,
 * compute subtotal, tax, and grand total in cents.
 */
function calculateTotalsFromCents(
  lineTotalsCents: number[],
  taxConfig: TenantTaxConfig
): TotalsResult {
  const subtotalCents = lineTotalsCents.reduce(
    (sum, cents) => sum + (cents || 0),
    0
  );

  const chargeTax =
    taxConfig.chargeTaxOnOnline !== undefined
      ? taxConfig.chargeTaxOnOnline
      : true;

  const rate = taxConfig.taxRate ?? 0;

  if (!chargeTax || rate <= 0) {
    return {
      subtotalCents,
      taxCents: 0,
      totalCents: subtotalCents,
    };
  }

  const taxIncluded = !!taxConfig.taxIncluded;

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

/**
 * Submit an order from the storefront cart.
 * Creates order, order_lines, and a notification record.
 */
export async function submitOrder(
  tenantId: string,
  cartItems: CartItem[],
  products: any[],
  customerInfo: CustomerInfo,
  tenantTaxConfig?: TenantTaxConfig
): Promise<OrderResult> {
  try {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    if (!cartItems || cartItems.length === 0) {
      throw new Error('Cart is empty');
    }

    // 1) Build line drafts and capture line totals in cents
    const lineDrafts: Array<{
      productId: string;
      quantity: number;
      binWeight: number | null;
      weight: number | null;
      isPreOrder: boolean;
      unitPriceCents: number;
      lineTotalCents: number;
    }> = [];

    for (const item of cartItems) {
      const typed = item as any;

      const product = products.find((p) => p.id === typed.productId);
      if (!product) {
        throw new Error(`Product not found: ${typed.productId}`);
      }

      const quantity: number = typed.quantity ?? 1;
      const binWeight: number | null =
        typeof typed.binWeight === 'number' ? typed.binWeight : null;
      const weight: number | null =
        typeof typed.weight === 'number' ? typed.weight : null;
      const isPreOrder: boolean = !!typed.isPreOrder;

      const pricingMode: 'weight' | 'fixed' | undefined = product.pricingMode;

      let unitPrice: number; // dollars per lb or per item
      let lineTotal: number; // dollars

      if (binWeight && typeof typed.unitPriceCents === 'number') {
        // Pre-packaged bin: unitPriceCents is per lb; apply to bin weight
        unitPrice = typed.unitPriceCents / 100;
        lineTotal = unitPrice * binWeight * quantity;
      } else if (pricingMode === 'weight' && weight) {
        // Custom weight entry or standard weight-based pricing
        unitPrice = product.pricePer;
        lineTotal = unitPrice * weight * quantity;
      } else {
        // Fixed-price by quantity
        unitPrice = product.pricePer;
        lineTotal = unitPrice * quantity;
      }

      const unitPriceCents = Math.round(unitPrice * 100);
      const lineTotalCents = Math.round(lineTotal * 100);

      lineDrafts.push({
        productId: typed.productId,
        quantity,
        binWeight,
        weight,
        isPreOrder,
        unitPriceCents,
        lineTotalCents,
      });
    }

    // 2) Compute subtotal / tax / total in cents using tenant tax config
    const totals = calculateTotalsFromCents(
      lineDrafts.map((l) => l.lineTotalCents),
      tenantTaxConfig ?? {}
    );

    const totalDollars = totals.totalCents / 100;

    // 3) Create the order (store cents and legacy float total)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        tenant_id: tenantId,
        customer_name: customerInfo.name,
        customer_email: customerInfo.email,
        customer_phone: customerInfo.phone,
        subtotal_cents: totals.subtotalCents,
        tax_cents: totals.taxCents,
        total_cents: totals.totalCents,
        // Legacy float total for any existing dashboards
        total: totalDollars,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      throw orderError;
    }

    if (!order) {
      throw new Error('Order creation failed - no order returned');
    }

    // 4) Create order_lines with detailed weight / bin / pre-order data
    const orderLines = lineDrafts.map((draft) => ({
      order_id: order.id,
      tenant_id: tenantId,
      product_id: draft.productId,
      quantity: draft.quantity,
      bin_weight: draft.binWeight,
      weight: draft.weight,
      is_pre_order: draft.isPreOrder,
      unit_price_cents: draft.unitPriceCents,
      line_total_cents: draft.lineTotalCents,
      created_at: new Date().toISOString(),
    }));

    const { error: linesError } = await supabase
      .from('order_lines')
      .insert(orderLines);

    if (linesError) {
      console.error('Error creating order lines:', linesError);
      // Try to clean up the order so you don't end up with a header and no lines
      await supabase.from('orders').delete().eq('id', order.id);
      throw linesError;
    }

    // 5) Create notification for owner
    const { error: notificationError } = await supabase
      .from('notifications_log')
      .insert({
        type: 'new_order',
        order_id: order.id,
        recipient: 'owner', // Could be enhanced to use actual owner user ID
        message: `New online order from ${customerInfo.name} - $${totalDollars.toFixed(
          2
        )}`,
        read: false,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
      });

    if (notificationError) {
      console.error('Error creating order notification:', notificationError);
      // Don't fail the whole order just because of a notification issue
    }

    return {
      success: true,
      orderId: order.id,
    };
  } catch (error) {
    console.error('Order submission error:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'An unknown error occurred while submitting the order',
    };
  }
}

/**
 * Mark an order as ready and (optionally) notify the customer.
 */
export async function notifyOrderReady(
  orderId: string,
  customerEmail: string
): Promise<boolean> {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return false;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'ready',
        ready_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Error updating order ready status:', updateError);
      return false;
    }

    // TODO: Integrate actual email/RCS sending here.
    // For now, just log it to a notifications_log table.
    const logged = await logOrderReadyNotification(orderId, customerEmail);
    if (!logged) {
      console.warn('Order marked ready, but failed to log ready notification');
    }

    return true;
  } catch (error) {
    console.error('Notify order ready error:', error);
    return false;
  }
}

/**
 * Internal helper to log that an order-ready notification was (or will be) sent.
 */
async function logOrderReadyNotification(
  orderId: string,
  customerEmail: string
): Promise<boolean> {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return false;
    }

    const { error } = await supabase.from('notifications_log').insert({
      type: 'order_ready',
      order_id: orderId,
      recipient: customerEmail,
      message: `Order ${orderId} is ready for pickup/delivery.`,
      read: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error creating ready notification:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Notify order ready error:', error);
    return false;
  }
}
