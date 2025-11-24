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
    // Prices already include tax; back out the net total.
    const gross = subtotalCents;
    const net = Math.round(gross / (1 + rate));
    const taxCents = gross - net;

    return {
      subtotalCents: net,
      taxCents,
      totalCents: gross,
    };
  }

  // Prices are pre-tax; add tax on top.
  const taxCents = Math.round(subtotalCents * rate);
  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

interface LineDraft {
  productId: string;
  productName: string;
  quantity: number;
  binWeight: number | null;
  weightLbs: number | null;
  isPreOrder: boolean;
  unitPriceCents: number;
  lineTotalCents: number;
  pricePerLabel: 'weight' | 'fixed' | 'unit' | 'lb' | string;
}

/**
 * Submit an order from the storefront cart.
 * Creates order, order_lines, and a notification record.
 *
 * This bypasses the Edge Function and writes directly to Supabase,
 * but uses the exact same canonical schema as the Edge function.
 */
export async function submitOrder(
  tenantId: string,
  cartItems: CartItem[],
  products: any[],
  customerInfo: CustomerInfo,
  tenantTaxConfig: TenantTaxConfig = {}
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

    // 1) Build line drafts with unified pricing / weight logic
    const lineDrafts: LineDraft[] = [];

    for (const item of cartItems) {
      const typed: any = item;
      const product = products.find((p) => p.id === typed.productId);
      if (!product) {
        throw new Error(`Product not found: ${typed.productId}`);
      }

      const quantity: number = typed.quantity ?? 1;
      const binWeight: number | null =
        typeof typed.binWeight === 'number' ? typed.binWeight : null;
      const weightLbs: number | null =
        typeof typed.weight === 'number' ? typed.weight : null;
      const isPreOrder: boolean = !!typed.isPreOrder;

      const pricingMode: 'weight' | 'fixed' | undefined = (product as any).pricingMode;

      let unitPrice: number; // dollars per lb or per unit
      let lineTotal: number; // dollars

      if (binWeight && typeof typed.unitPriceCents === 'number') {
        // Pre-packaged bin: unitPriceCents is per lb; apply to bin
        unitPrice = typed.unitPriceCents / 100;
        lineTotal = unitPrice * binWeight * quantity;
      } else if (pricingMode === 'weight' && weightLbs) {
        // Weight-based pricing
        unitPrice = (product as any).pricePer;
        lineTotal = unitPrice * weightLbs * quantity;
      } else {
        // Fixed price item
        unitPrice = (product as any).pricePer;
        lineTotal = unitPrice * quantity;
      }

      const unitPriceCents = Math.round(unitPrice * 100);
      const lineTotalCents = Math.round(lineTotal * 100);

      const pricePerLabel: LineDraft['pricePerLabel'] =
        pricingMode === 'weight' ? 'lb' : 'unit';

      lineDrafts.push({
        productId: typed.productId,
        productName: (product as any).name ?? (product as any).productName ?? '',
        quantity,
        binWeight,
        weightLbs,
        isPreOrder,
        unitPriceCents,
        lineTotalCents,
        pricePerLabel,
      });
    }

    // 2) Compute subtotal / tax / total in cents using tenant tax config
    const totals = calculateTotalsFromCents(
      lineDrafts.map((l) => l.lineTotalCents),
      tenantTaxConfig
    );

    const totalDollars = totals.totalCents / 100;

    // 3) Create the order
    const nowIso = new Date().toISOString();
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
        status: 'pending',
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select()
      .single();

    if (orderError) {
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
      product_name: draft.productName,

      // Canonical quantity/weight fields
      quantity: draft.quantity,
      weight_lbs: draft.weightLbs,
      bin_weight: draft.binWeight,
      is_pre_order: draft.isPreOrder,

      // Pricing fields
      unit_price_cents: draft.unitPriceCents,
      price_per: draft.unitPriceCents / 100, // dollars per unit/lb
      line_total_cents: draft.lineTotalCents,

      created_at: new Date().toISOString(),
    }));

    const { error: linesError } = await supabase
      .from('order_lines')
      .insert(orderLines);

    if (linesError) {
      throw linesError;
    }

    // 5) Create notification for owner
    const { error: notificationError } = await supabase
      .from('notifications_log')
      .insert({
        type: 'new_order',
        order_id: order.id,
        recipient: 'owner', // could be improved to an actual user
        message: `New online order from ${customerInfo.name} - $${totalDollars.toFixed(
          2
        )}`,
        read: false,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
      });

    if (notificationError) {
      // Not fatal to the order; we log and still return success.
      console.warn('Notification insert failed:', notificationError);
    }

    return {
      success: true,
      orderId: order.id,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to submit order';
    return {
      success: false,
      error: message,
    };
  }
}
