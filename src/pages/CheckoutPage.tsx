import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { useStorefrontData } from '../hooks/useStorefrontData';
import { usePersistedCart } from '../hooks/usePersistedCart';
import { useCheckout, type CheckoutData } from '../hooks/useCheckout';
import { trackBeginCheckout, trackPurchase } from '../utils/analytics';
import { supabase } from '../lib/supabase';

interface Discount {
  id: string;
  name: string;
  coupon_code?: string;
  is_percentage: boolean;
  discount_amount: number;
  is_active: boolean;
}

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
    paymentMethod: '', // No default - force user to choose
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
  
  // Discount state
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; percent: number } | null>(null);
  const [discountCents, setDiscountCents] = useState(0);

  // Load discounts from tenant
  useEffect(() => {
    async function loadDiscounts() {
      console.log('[Discount] Component mounted, tenant:', tenant);
      console.log('[Discount] Loading discounts for tenant:', tenant?.id);
      if (!tenant?.id) {
        console.log('[Discount] No tenant ID, skipping discount load');
        setDiscountsLoading(false);
        return;
      }
      setDiscountsLoading(true);
      try {
        // Ensure we have a session before querying
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[Discount] Session:', session ? 'authenticated' : 'anonymous');
        
        console.log('[Discount] Fetching from Supabase with RLS bypass attempt...');
        // Try querying directly without RLS first to see if data exists
        const { data, error } = await supabase
          .from('tenant_discounts')
          .select('*')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true);
        
        console.log('[Discount] Supabase query result:', { data, error, tenantId: tenant.id, dataLength: data?.length });
        
        if (error) {
          console.error('[Discount] Supabase error:', error);
          // Try alternative: query all active discounts without tenant filter (for debugging)
          console.log('[Discount] Trying alternative query without tenant filter...');
          const { data: allData, error: allError } = await supabase
            .from('tenant_discounts')
            .select('*')
            .eq('is_active', true);
          console.log('[Discount] Alternative query result:', { allData, allError });
        } else if (data && data.length > 0) {
          console.log('[Discount] Setting discounts:', data);
          setDiscounts(data as Discount[]);
        } else {
          console.log('[Discount] Query returned empty array');
          setDiscounts([]);
        }
      } catch (e) {
        console.error('[Discount] Exception:', e);
      } finally {
        setDiscountsLoading(false);
      }
    }
    loadDiscounts();
  }, [tenant?.id]);

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

        // Validate price
        if (!unitPriceInCents || unitPriceInCents <= 0) {
          throw new Error(`Invalid price for ${productName}: ${unitPriceInCents}`);
        }

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
                binWeight: item.binWeight ? String(item.binWeight) : undefined, // Weight per unit for pre-packaged bins
                weight: item.weight ? String(item.weight) : undefined, // Weight per unit for custom weight
                unit: product?.unit || 'ea', // 'lb' or 'ea'
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
        // Calculate tax on subtotal minus discount
        const subtotalAfterDiscount = cart.total - (discountCents / 100);
        const taxAmount = Math.round(subtotalAfterDiscount * 100 * taxRate);
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
          discountCents, // Pass discount to edge function
          discountCode: appliedDiscount?.code || null, // Pass discount code for display
          metadata: {
            customer_name: formData.customerName,
            customer_phone: formData.customerPhone,
            delivery_method: formData.deliveryMethod,
            delivery_address: formData.deliveryAddress || '',
            delivery_notes: formData.deliveryNotes || '',
            discount_cents: discountCents,
            discount_code: appliedDiscount?.code || '',
          },
        },
      });

      if (error) {
        console.error('❌ Supabase function error:', error);
        throw error;
      }
      
      // Check for error in function response
      if (data?.error) {
        console.error('❌ Function returned error:', data.error);
        alert(`Checkout failed: ${data.error}`);
        return;
      }
      
      if (!data?.url) {
        console.error('❌ No checkout URL in response:', data);
        throw new Error('No checkout URL returned');
      }

      console.log('✅ Got checkout URL:', data.url);
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

    if (!formData.paymentMethod) {
      alert('Please select a payment method.');
      return;
    }

    if (formData.deliveryMethod === 'delivery' && !formData.deliveryAddress) {
      alert('Please provide a delivery address.');
      return;
    }

    const orderValue = cart.total - (discountCents / 100);

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

    console.log('📋 [Order] About to create order with:', {
      tenantId: tenant.id,
      discountCents,
      appliedDiscount: appliedDiscount,
      cartTotal: cart.total,
      cartItems: cart.items.length,
    });

const result = await createOrder(
  tenant.id,
  cart,
  storefrontData.products,
  {
    ...formData,
    subscription: subscriptionPayload,
    discountCents,
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

  const handleApplyCoupon = async (code: string) => {
    if (!code.trim()) {
      setCouponError('Please enter a coupon code');
      return;
    }

    try {
      // Find discount by coupon code or name
      console.log('[Discount] Searching for code:', code, 'in discounts:', discounts);
      const discount = discounts.find(d => {
        const normalizedCode = code.toUpperCase();
        console.log('[Discount] Checking discount:', d.name, 'coupon_code:', d.coupon_code, 'is_active:', d.is_active);
        // Check coupon_code if it's not empty
        if (d.coupon_code && d.coupon_code.trim()) {
          const matches = d.coupon_code.toUpperCase() === normalizedCode;
          console.log('[Discount] Checking coupon_code:', d.coupon_code, 'vs', normalizedCode, '=', matches);
          return matches;
        }
        // Otherwise check name
        const matches = d.name?.toUpperCase() === normalizedCode;
        console.log('[Discount] Checking name:', d.name, 'vs', normalizedCode, '=', matches);
        return matches;
      });
      console.log('[Discount] Found discount:', discount);

      if (!discount) {
        setCouponError('Invalid coupon code');
        setAppliedDiscount(null);
        setDiscountCents(0);
        return;
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (discount.is_percentage) {
        discountAmount = (cartTotal * discount.discount_amount) / 100;
      } else {
        discountAmount = discount.discount_amount;
      }

      const newDiscountCents = Math.round(discountAmount * 100);
      setDiscountCents(newDiscountCents);
      setAppliedDiscount({
        code: code.toUpperCase(),
        amount: discountAmount,
        percent: discount.is_percentage ? discount.discount_amount : 0,
      });
      setCouponCode('');
      setCouponError('');
    } catch (err) {
      setCouponError('Failed to apply coupon');
      setAppliedDiscount(null);
      setDiscountCents(0);
    }
  };

  const handleClearCoupon = () => {
    setAppliedDiscount(null);
    setCouponCode('');
    setCouponError('');
    setDiscountCents(0);
  };

  const primaryColor = storefrontData?.settings.primaryColor || '#0f6fff';

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div 
            className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
            style={{ borderColor: primaryColor }}
          ></div>
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
              className="w-full text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:opacity-90 hover:shadow-lg"
              style={{ backgroundColor: primaryColor }}
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
              className="inline-flex items-center hover:opacity-80 transition-opacity mb-4"
              style={{ color: primaryColor }}
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
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                      style={{ '--tw-ring-color': primaryColor } as any}
                      onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                      onBlur={(e) => e.currentTarget.style.borderColor = ''}
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
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                      onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                      onBlur={(e) => e.currentTarget.style.borderColor = ''}
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
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                      onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                      onBlur={(e) => e.currentTarget.style.borderColor = ''}
                      placeholder="Enter your phone number"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Method */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Delivery Method</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <button
                    type="button"
                    onClick={() => handleInputChange('deliveryMethod', 'pickup')}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      formData.deliveryMethod === 'pickup'
                        ? 'border-current shadow-lg'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={formData.deliveryMethod === 'pickup' ? {
                      borderColor: primaryColor,
                      backgroundColor: `${primaryColor}08`,
                      boxShadow: `0 0 20px ${primaryColor}40`
                    } : {}}
                  >
                    <div className="text-center">
                      <div className="text-3xl mb-2">📦</div>
                      <div className="font-semibold text-gray-800">Pickup</div>
                      <div className="text-sm font-medium mt-1" style={{ color: primaryColor }}>Free</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInputChange('deliveryMethod', 'delivery')}
                    className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                      formData.deliveryMethod === 'delivery'
                        ? 'border-current shadow-lg'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={formData.deliveryMethod === 'delivery' ? {
                      borderColor: primaryColor,
                      backgroundColor: `${primaryColor}08`,
                      boxShadow: `0 0 20px ${primaryColor}40`
                    } : {}}
                  >
                    <div className="text-center">
                      <div className="text-3xl mb-2">🚚</div>
                      <div className="font-semibold text-gray-800">Delivery</div>
                      <div className="text-sm text-gray-500 mt-1">Local area</div>
                    </div>
                  </button>
                </div>
                {formData.deliveryMethod === 'delivery' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Delivery Address *
                    </label>
                    <input
                      type="text"
                      required={formData.deliveryMethod === 'delivery'}
                      value={formData.deliveryAddress || ''}
                      onChange={(e) => handleInputChange('deliveryAddress', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                      onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                      onBlur={(e) => e.currentTarget.style.borderColor = ''}
                      placeholder="Full delivery address"
                    />
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Payment Method</h2>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button
                    type="button"
                    onClick={() => handleInputChange('paymentMethod', 'cash')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                      formData.paymentMethod === 'cash'
                        ? 'border-current shadow-lg'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={formData.paymentMethod === 'cash' ? {
                      borderColor: primaryColor,
                      boxShadow: `0 0 20px ${primaryColor}40`
                    } : {}}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-2">💵</div>
                      <div className="font-medium text-gray-800">Cash</div>
                      <div className="text-xs text-gray-500 mt-1">Pay at {formData.deliveryMethod === 'delivery' ? 'delivery' : 'pickup'}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInputChange('paymentMethod', 'card')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                      formData.paymentMethod === 'card'
                        ? 'border-current shadow-lg'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={formData.paymentMethod === 'card' ? {
                      borderColor: primaryColor,
                      boxShadow: `0 0 20px ${primaryColor}40`
                    } : {}}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-2">💳</div>
                      <div className="font-medium text-gray-800">Credit Card</div>
                      <div className="text-xs text-gray-500 mt-1">Pay now</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInputChange('paymentMethod', 'venmo')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                      formData.paymentMethod === 'venmo'
                        ? 'border-current shadow-lg'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={formData.paymentMethod === 'venmo' ? {
                      borderColor: primaryColor,
                      boxShadow: `0 0 20px ${primaryColor}40`
                    } : {}}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-2">📱</div>
                      <div className="font-medium text-gray-800">Venmo</div>
                      <div className="text-xs text-gray-500 mt-1">Pay later</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleInputChange('paymentMethod', 'zelle')}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                      formData.paymentMethod === 'zelle'
                        ? 'border-current shadow-lg'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={formData.paymentMethod === 'zelle' ? {
                      borderColor: primaryColor,
                      boxShadow: `0 0 20px ${primaryColor}40`
                    } : {}}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-2">🏦</div>
                      <div className="font-medium text-gray-800">Zelle</div>
                      <div className="text-xs text-gray-500 mt-1">Pay later</div>
                    </div>
                  </button>
                </div>

                {formData.paymentMethod && formData.paymentMethod !== 'card' && (
                  <div className="rounded-md p-4" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40`, borderWidth: '1px' }}>
                    <p className="text-sm" style={{ color: primaryColor}}>
                      You'll pay when you {formData.deliveryMethod === 'pickup' ? 'pick up' : 'receive'} your order.
                    </p>
                  </div>
                )}

                {formData.paymentMethod === 'card' && (
                  <div className="rounded-md p-4" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40`, borderWidth: '1px' }}>
                    <p className="text-sm" style={{ color: primaryColor }}>
                      You'll be redirected to Stripe's secure checkout to complete your payment.
                    </p>
                  </div>
                )}

                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delivery Notes
                  </label>
                  <textarea
                    value={formData.deliveryNotes || ''}
                    onChange={(e) => handleInputChange('deliveryNotes', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors resize-none"
                    onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                    onBlur={(e) => e.currentTarget.style.borderColor = ''}
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
                  
                  {/* Discount Section */}
                  <div className="border-t pt-4 space-y-3">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Discount Code
                      </label>
                      {appliedDiscount ? (
                        <div className="flex gap-2">
                          <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-sm text-green-700">
                              ✓ {appliedDiscount.code} applied: {appliedDiscount.percent > 0 ? `${appliedDiscount.percent}% off` : `$${appliedDiscount.amount.toFixed(2)} off`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearCoupon}
                            className="px-3 py-2 text-red-600 hover:text-red-700 font-medium border border-red-300 rounded-lg hover:bg-red-50 transition"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Enter coupon code"
                            value={couponCode}
                            onChange={(e) => {
                              setCouponCode(e.target.value.toUpperCase());
                              setCouponError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleApplyCoupon(couponCode);
                            }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 transition"
                            style={{ '--tw-ring-color': primaryColor } as any}
                          />
                          <button
                            type="button"
                            onClick={() => handleApplyCoupon(couponCode)}
                            disabled={!couponCode.trim() || discountsLoading}
                            className="px-4 py-2 text-white rounded-lg font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: primaryColor }}
                          >
                            Apply
                          </button>
                        </div>
                      )}
                      {couponError && (
                        <p className="text-sm text-red-600">{couponError}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal:</span>
                      <span>${cartTotal.toFixed(2)}</span>
                    </div>
                    {discountCents > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Discount:</span>
                        <span className="text-red-600">-${(discountCents / 100).toFixed(2)}</span>
                      </div>
                    )}
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
    {(() => {
      const subtotal = cartTotal - (discountCents / 100);
      const tax = tenant?.charge_tax_on_online === false
        ? 0
        : tenant?.tax_included
        ? 0
        : subtotal * (tenant?.tax_rate ?? 0);
      const total = tenant?.charge_tax_on_online === false
        ? subtotal
        : tenant?.tax_included
        ? subtotal
        : subtotal + tax;
      return `$${total.toFixed(2)}`;
    })()}
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
                disabled={cartItems.length === 0 || checkoutLoading || !formData.paymentMethod}
                className="w-full mt-6 text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: primaryColor }}
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