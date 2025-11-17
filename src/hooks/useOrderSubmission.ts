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

/**
 * Submit an order from the storefront cart
 * Creates order, order_lines, and notification records
 */
export async function submitOrder(
  tenantId: string,
  cartItems: CartItem[],
  products: any[],
  customerInfo: CustomerInfo
): Promise<OrderResult> {
  try {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    if (cartItems.length === 0) {
      throw new Error('Cart is empty');
    }

    // Calculate total
    const total = cartItems.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      if (!product) return sum;
      
      if (item.binWeight && item.unitPriceCents) {
        const linePrice = (item.binWeight * (item.unitPriceCents / 100)) * item.quantity;
        return sum + linePrice;
      }
      
      return sum + (product.pricePer * item.quantity);
    }, 0);

    // 1. Create the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        tenant_id: tenantId,
        customer_name: customerInfo.name,
        customer_email: customerInfo.email,
        customer_phone: customerInfo.phone,
        total: total,
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

    // 2. Create order lines
    const orderLines = cartItems.map(item => {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const pricePerUnit = item.binWeight && item.unitPriceCents
        ? (item.binWeight * (item.unitPriceCents / 100))
        : product.pricePer;

      return {
        order_id: order.id,
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

    if (linesError) {
      console.error('Error creating order lines:', linesError);
      // Try to clean up the order
      await supabase.from('orders').delete().eq('id', order.id);
      throw linesError;
    }

    // 3. Create notification for owner
    const { error: notificationError } = await supabase
      .from('notifications_log')
      .insert({
        type: 'new_order',
        order_id: order.id,
        recipient: 'owner', // Could be enhanced to use actual owner user ID
        message: `New online order from ${customerInfo.name} - $${total.toFixed(2)}`,
        read: false,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
      });

    if (notificationError) {
      console.error('Error creating notification:', notificationError);
      // Non-fatal - order still succeeded
    }

    return {
      success: true,
      orderId: order.id,
    };

  } catch (error) {
    console.error('Order submission error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Create a notification that an order is ready for pickup
 * Called by owner/admin from the POS system
 */
export async function notifyOrderReady(
  tenantId: string,
  orderId: string,
  customerEmail: string
): Promise<boolean> {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return false;
    }

    const { error } = await supabase
      .from('notifications_log')
      .insert({
        type: 'order_ready',
        order_id: orderId,
        recipient: customerEmail,
        message: 'Your order is ready for pickup!',
        read: false,
        tenant_id: tenantId,
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
