import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { useStorefrontData } from '../hooks/useStorefrontData';
import { usePersistedCart } from '../hooks/usePersistedCart';
import { useCheckout, type CheckoutData } from '../hooks/useCheckout';
import { trackBeginCheckout, trackPurchase } from '../utils/analytics';
import { supabase } from '../lib/supabase';

export function CheckoutPage() {
  
  const navigate = useNavigate();
  const { tenant } = useTenantFromDomain();
  const { data: storefrontData, loading: dataLoading } = useStorefrontData(tenant?.id || '');
  const { cart, clearCart, updateCartTotal } = usePersistedCart();
  const { createOrder, loading: checkoutLoading, error: checkoutError } = useCheckout();

  const [formData, setFormData] = useState<CheckoutData>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryMethod: 'pickup',
    paymentMethod: 'cash',
    deliveryAddress: '',
    deliveryNotes: '',
  });

  // Load customer info if logged in
  useEffect(() => {
    async function loadCustomerInfo() {
      if (!supabase) return;
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Get customer profile
        const { data: profile } = await supabase
          .from('customer_profiles')
          .select('full_name, email, phone, default_delivery_address, default_delivery_notes')
          .eq('id', user.id)
          .single();

        if (profile) {
          setFormData(prev => ({
            ...prev,
            customerName: profile.full_name || user.email || '',
            customerEmail: profile.email || user.email || '',
            customerPhone: profile.phone || '',
            deliveryAddress: profile.default_delivery_address || '',
            deliveryNotes: profile.default_delivery_notes || '',
          }));
        } else {
          // No profile yet, use auth data
          setFormData(prev => ({
            ...prev,
            customerName: user.user_metadata?.full_name || user.email || '',
            customerEmail: user.email || '',
          }));
        }
      }
    }

    loadCustomerInfo();
  }, []);

  
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderId, setOrderId] = useState<string>();

  // Update cart totals when products load
  useEffect(() => {
    if (storefrontData?.products) {
      updateCartTotal(storefrontData.products);
    }
  }, [storefrontData?.products, updateCartTotal]);

  // Track begin_checkout when arriving at checkout with items
  useEffect(() => {
    if (cart.items.length > 0) {
      trackBeginCheckout({ tenantId: tenant?.id, itemsCount: cart.items.length, value: cart.total, currency: 'USD' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redirect if cart is empty
  useEffect(() => {
    if (!dataLoading && cart.items.length === 0 && !orderSuccess) {
      navigate('/');
    }
  }, [cart.items.length, dataLoading, orderSuccess, navigate]);

  const handleInputChange = (field: keyof CheckoutData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleStripeCheckout = async () => {
    if (!tenant || !storefrontData?.products) return;

    try {
      // Prepare line items for Stripe
      const lineItems = cart.items.map((item: any) => {
        const product = storefrontData.products.find((p: any) => p.id === item.productId);
        const productName = product?.name || 'Product';
        
        // Calculate unit_amount based on item type
        let unitPriceInCents = 0;
        
        if (item.binWeight && item.unitPriceCents) {
          // Pre-packaged weight bins: unitPriceCents is price per lb, multiply by binWeight
          unitPriceInCents = Math.round(item.binWeight * item.unitPriceCents);
        } else if (item.weight && product?.pricingMode === 'weight') {
          // Custom weight entry: price per lb * weight
          unitPriceInCents = Math.round(item.weight * product.pricePer * 100);
        } else if (item.unitPriceCents) {
          // Items with unitPriceCents explicitly stored (already in cents)
          unitPriceInCents = item.unitPriceCents;
        } else if (product?.pricePer) {
          // Standard fixed pricing: convert dollars to cents
          unitPriceInCents = Math.round(product.pricePer * 100);
        } else {
          console.error('Unable to determine price for item:', item);
        }
        
        console.log('Line item:', {
          productId: item.productId,
          productName,
          binWeight: item.binWeight,
          weight: item.weight,
          unitPriceCents: item.unitPriceCents,
          productPricePer: product?.pricePer,
          quantity: item.quantity,
          finalUnitPrice: unitPriceInCents
        });

        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productName,
              description: item.metadata?.isSubscription 
                ? `${item.metadata.subscriptionInterval} subscription` 
                : undefined,
              metadata: {
                product_id: item.productId, // Store product ID for order creation
              },
            },
            unit_amount: unitPriceInCents,
          },
          quantity: item.quantity,
        };
      });

      // Calculate tax if applicable
      const taxRate = tenant?.tax_rate ?? 0;
      const chargeTax = tenant?.charge_tax_on_online !== false;
      const taxIncluded = tenant?.tax_included ?? false;
      
      if (chargeTax && !taxIncluded && taxRate > 0) {
        const taxAmount = Math.round(cart.total * 100 * taxRate);
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Tax',
              description: undefined,
            },
            unit_amount: taxAmount,
          },
          quantity: 1,
        });
      }

      // Save form data to localStorage for order creation after payment
      localStorage.setItem('checkout-form-data', JSON.stringify(formData));
      
      // Call Supabase function to create Stripe checkout session
      const { data, error } = await supabase!.functions.invoke('create-storefront-checkout', {
        body: {
          mode: 'payment',
          lineItems,
          tenantId: tenant.id,
          customerEmail: formData.customerEmail,
          successUrl: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/checkout/cancel`,
          metadata: {
            customer_name: formData.customerName,
            customer_phone: formData.customerPhone,
            delivery_method: formData.deliveryMethod,
            delivery_address: formData.deliveryAddress || '',
            delivery_notes: formData.deliveryNotes || '',
          },
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No checkout URL returned');

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (error) {
      console.error('Stripe checkout error:', error);
      alert('Failed to start checkout. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenant || !storefrontData?.products) {
      alert('Unable to process order. Please try again.');
      return;
    }

    // Validate required fields
    if (!formData.customerName || !formData.customerEmail || !formData.customerPhone) {
      alert('Please fill in all required fields.');
      return;
    }

    if (formData.deliveryMethod === 'delivery' && !formData.deliveryAddress) {
      alert('Please provide a delivery address.');
      return;
    }

    const orderValue = cart.total;

    // Handle Stripe checkout for card payments
    if (formData.paymentMethod === 'card') {
      await handleStripeCheckout();
      return;
    }
    // Check if cart contains a subscription item
    console.log('🔍 Checking cart for subscription items:', cart.items);
    const subscriptionItem = cart.items.find((item: any) => item.metadata?.isSubscription);
    console.log('🔍 Found subscription item:', subscriptionItem);
    let subscriptionPayload = undefined;
    
    if (subscriptionItem) {
      const metadata = (subscriptionItem as any).metadata;
      console.log('🔍 Subscription metadata:', metadata);
      subscriptionPayload = {
        enabled: true,
        cadence: metadata.subscriptionInterval as 'weekly' | 'biweekly' | 'monthly',
        startDate: new Date().toISOString(),
        subscriptionProductId: metadata.subscriptionProductId, // subscription_products.id
        quantity: subscriptionItem.quantity,
      };
      console.log('🔍 Subscription payload created:', subscriptionPayload);
    } else {
      console.log('⚠️ No subscription item found in cart');
    }

const result = await createOrder(
  tenant.id,
  cart,
  storefrontData.products,
  {
    ...formData,
    subscription: subscriptionPayload,
  },
  {
    taxRate: tenant?.tax_rate ?? 0,
    taxIncluded: !!tenant?.tax_included,
    chargeTaxOnOnline: tenant?.charge_tax_on_online ?? true,
  }
);

    if (result.success) {
      setOrderSuccess(true);
      setOrderId(result.orderId);
      try {
        trackPurchase({ orderId: result.orderId!, tenantId: tenant.id, value: orderValue, currency: 'USD', itemsCount: cart.items.length });
      } catch {}
      clearCart();
    } else {
      alert(result.error || 'Failed to create order. Please try again.');
    }
  };

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Order Placed!</h1>
          <p className="text-gray-600 mb-4">
            Thank you for your order. You'll receive a confirmation email shortly.
          </p>
          {orderId && (
            <p className="text-sm text-gray-500 mb-6">
              Order ID: {orderId}
            </p>
          )}
          <div className="space-y-3">
            <button
              onClick={() => navigate('/')}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  const cartItems = cart.items.map(item => {
    const product = storefrontData?.products.find(p => p.id === item.productId);
    return product ? { ...item, product } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  // Calculate actual cart total based on items
  const cartTotal = cartItems.reduce((sum, item) => {
    if (!item?.product) return sum;
    
    const weight = (item as any).weight;
    const binWeight = (item as any).binWeight;
    const unitPriceCents = (item as any).unitPriceCents;
    const quantity = item.quantity;
    
    let itemTotal = 0;
    
    if (binWeight && unitPriceCents) {
      itemTotal = binWeight * (unitPriceCents / 100) * quantity;
    } else if (weight && weight > 0) {
      itemTotal = item.product.pricePer * weight * quantity;
    } else {
      itemTotal = item.product.pricePer * quantity;
    }
    
    return sum + itemTotal;
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Store
            </button>
            <h1 className="text-3xl font-bold text-gray-800">Checkout</h1>
          </div>
          
          <form onSubmit={handleSubmit} className="grid lg:grid-cols-2 gap-8">
            {/* Customer Information */}
            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Contact Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.customerName}
                      onChange={(e) => handleInputChange('customerName', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.customerEmail}
                      onChange={(e) => handleInputChange('customerEmail', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your email"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.customerPhone}
                      onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter your phone number"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Method */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Delivery Method</h2>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="pickup"
                      name="deliveryMethod"
                      value="pickup"
                      checked={formData.deliveryMethod === 'pickup'}
                      onChange={(e) => handleInputChange('deliveryMethod', e.target.value)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="pickup" className="ml-3 text-sm font-medium text-gray-700">
                      Pickup (Free)
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="delivery"
                      name="deliveryMethod"
                      value="delivery"
                      checked={formData.deliveryMethod === 'delivery'}
                      onChange={(e) => handleInputChange('deliveryMethod', e.target.value)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="delivery" className="ml-3 text-sm font-medium text-gray-700">
                      Local Delivery
                    </label>
                  </div>
                  {formData.deliveryMethod === 'delivery' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Delivery Address *
                      </label>
                      <input
                        type="text"
                        required={formData.deliveryMethod === 'delivery'}
                        value={formData.deliveryAddress || ''}
                        onChange={(e) => handleInputChange('deliveryAddress', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Full delivery address"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Payment Method</h2>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="cash"
                      name="paymentMethod"
                      value="cash"
                      checked={formData.paymentMethod === 'cash'}
                      onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="cash" className="ml-3 text-sm font-medium text-gray-700">
                      Pay at Pickup/Delivery (Cash)
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="card"
                      name="paymentMethod"
                      value="card"
                      checked={formData.paymentMethod === 'card'}
                      onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="card" className="ml-3 text-sm font-medium text-gray-700">
                      Credit Card (Pay Now)
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="venmo"
                      name="paymentMethod"
                      value="venmo"
                      checked={formData.paymentMethod === 'venmo'}
                      onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="venmo" className="ml-3 text-sm font-medium text-gray-700">
                      Venmo (Pay Later)
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="zelle"
                      name="paymentMethod"
                      value="zelle"
                      checked={formData.paymentMethod === 'zelle'}
                      onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <label htmlFor="zelle" className="ml-3 text-sm font-medium text-gray-700">
                      Zelle (Pay Later)
                    </label>
                  </div>

                  {formData.paymentMethod !== 'card' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <p className="text-sm text-blue-800">
                        You'll pay when you {formData.deliveryMethod === 'pickup' ? 'pick up' : 'receive'} your order. We accept cash, and also Venmo or Zelle.
                      </p>
                    </div>
                  )}

                  {formData.paymentMethod === 'card' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <p className="text-sm text-blue-800">
                        You'll be redirected to Stripe's secure checkout to complete your payment.
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Notes
                  </label>
                  <textarea
                    value={formData.deliveryNotes || ''}
                    onChange={(e) => handleInputChange('deliveryNotes', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Any special requests or notes..."
                  />
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="bg-white rounded-lg shadow-md p-6 h-fit">
              <h2 className="text-xl font-semibold text-gray-800 mb-6">Order Summary</h2>
              
              {cartItems.length > 0 ? (
                <div className="space-y-4">
                  {cartItems.map((item) => {
                    const weight = (item as any).weight;
                    const binWeight = (item as any).binWeight;
                    const unitPriceCents = (item as any).unitPriceCents;
                    
                    let displayText = '';
                    let itemTotal = 0;
                    
                    if (binWeight && unitPriceCents) {
                      // Pre-packaged bin
                      displayText = `${binWeight} ${item.product.unit} package @ $${(unitPriceCents / 100).toFixed(2)}/${item.product.unit}`;
                      itemTotal = binWeight * (unitPriceCents / 100) * item.quantity;
                    } else if (weight && weight > 0) {
                      // Weight-based
                      displayText = `${weight} ${item.product.unit} @ $${item.product.pricePer.toFixed(2)}/${item.product.unit}`;
                      itemTotal = item.product.pricePer * weight;
                    } else {
                      // Fixed price
                      displayText = `${item.quantity} × $${item.product.pricePer.toFixed(2)}`;
                      itemTotal = item.product.pricePer * item.quantity;
                    }
                    
                    return (
                      <div key={`${item.productId}-${binWeight ?? weight ?? 'std'}`} className="flex justify-between items-center py-2 border-b">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-800">{item.product.name}</h4>
                          <p className="text-sm text-gray-600">
                            {displayText}
                          </p>
                        </div>
                        <span className="font-medium text-gray-800">
                          ${itemTotal.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                  
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal:</span>
                      <span>${cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
  <span>Tax:</span>
  <span>
    {tenant?.charge_tax_on_online === false
      ? '$0.00'
      : tenant?.tax_included
      ? 'Included in price'
      : `$${(cartTotal * (tenant?.tax_rate ?? 0)).toFixed(2)}`}
  </span>
</div>

<div className="flex justify-between text-lg font-bold text-gray-800 border-t pt-2">
  <span>Total:</span>
  <span>
    {tenant?.charge_tax_on_online === false
      ? `$${cartTotal.toFixed(2)}`
      : tenant?.tax_included
      ? `$${cartTotal.toFixed(2)}`
      : `$${(cartTotal * (1 + (tenant?.tax_rate ?? 0))).toFixed(2)}`}
  </span>
</div>

                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Your cart is empty</p>
                </div>
              )}

              {checkoutError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                  <p className="text-sm text-red-800">{checkoutError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={cartItems.length === 0 || checkoutLoading}
                className="w-full mt-6 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutLoading ? 'Processing...' : formData.paymentMethod === 'card' ? 'Continue to Payment' : 'Place Order'}
              </button>

              {formData.paymentMethod !== 'card' && cartItems.length > 0 && (
                <p className="text-xs text-gray-500 mt-3 text-center">
                  You'll receive an order confirmation email. Payment due at {formData.deliveryMethod === 'pickup' ? 'pickup' : 'delivery'}.
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}