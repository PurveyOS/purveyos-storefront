import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { useStorefrontData } from '../hooks/useStorefrontData';
import { useCart } from '../context/CartContext';
import { useCheckout, type CheckoutData, type GroupChoice } from '../hooks/useCheckout';
import { SubscriptionBoxSelector } from '../components/SubscriptionBoxSelector';
import { trackBeginCheckout, trackPurchase } from '../utils/analytics';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';

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
  const { cart, clearCart, updateCartTotal, removeItems } = useCart();
  const { createOrder, loading: checkoutLoading, error: checkoutError } = useCheckout();

  type ShippingAddress = {
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  const [formData, setFormData] = useState<CheckoutData>({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryMethod: 'pickup',
    paymentMethod: '' as any,
    deliveryAddress: '',
    deliveryNotes: '',
  });

  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    street: '',
    city: '',
    state: '',
    zip: '',
  });

  const [subscribeToEmails, setSubscribeToEmails] = useState(false);
  
  // Subscription state
  const [subscriptionProducts, setSubscriptionProducts] = useState<any[]>([]);
  const [enableSubscription, setEnableSubscription] = useState(false);
  const [selectedSubscriptionProductId, setSelectedSubscriptionProductId] = useState('');
  const [subscriptionSelections, setSubscriptionSelections] = useState<Record<string, GroupChoice[]>>({});
  const [loadingSubscriptionProducts, setLoadingSubscriptionProducts] = useState(false);

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

  // Load subscription products when tenant is available
  useEffect(() => {
    async function loadSubscriptionProducts() {
      if (!tenant?.id) return;
      
      setLoadingSubscriptionProducts(true);
      try {
        const { data, error } = await supabase
          .from('subscription_products')
          .select('id, name, description, price_per_interval, interval_type, is_active')
          .eq('tenant_id', tenant.id)
          .eq('is_active', true)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error loading subscription products:', error);
          return;
        }

        setSubscriptionProducts(data || []);
      } catch (err) {
        console.error('Error loading subscription products:', err);
      } finally {
        setLoadingSubscriptionProducts(false);
      }
    }

    loadSubscriptionProducts();
  }, [tenant?.id]);

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

  const formatShippingAddress = (address: ShippingAddress) => {
    return [address.street, address.city, address.state, address.zip].filter(Boolean).join(', ');
  };

  const formatDropLocation = (location: any) => {
    const base = [location?.name, location?.address].filter(Boolean).join(' - ').trim();
    const dayTime = [location?.day, location?.time].filter(Boolean).join(' @ ');
    return [base || 'Drop location', dayTime].filter(Boolean).join(' | ');
  };

  const buildPackageKey = (productId: string, unit: string | null | undefined, item: any) => {
    const isLb = (unit || '').toLowerCase() === 'lb';
    const rawWeight = isLb ? (item.binWeight ?? item.weight ?? 0) : 0;
    const weightBtn = Math.round(rawWeight * 100) / 100;
    const weightStr = (weightBtn || 0).toString().replace(/\.0+$/, '').replace(/\.([1-9]*)0+$/, '.$1');
    const safeWeight = weightStr.length > 0 ? weightStr : '0';
    return `${productId}|${safeWeight}`;
  };

  const verifyAndPruneCart = async (): Promise<boolean> => {
    if (!tenant?.id || cart.items.length === 0) return true;

    const productIds = Array.from(new Set(cart.items.map((i: any) => i.productId)));

    const [{ data: latestProducts, error: prodError }, { data: packageBins, error: binError }] = await Promise.all([
      supabase.from('products').select('id, unit, qty').eq('tenant_id', tenant.id).in('id', productIds),
      supabase.from('package_bins').select('product_id, package_key, qty, reserved_qty').eq('tenant_id', tenant.id).in('product_id', productIds),
    ]);

    if (prodError || binError) {
      console.error('Inventory preflight failed:', { prodError, binError });
      toast.error('Could not verify inventory. Please try again.');
      return false;
    }

    const productsById = new Map((latestProducts || []).map((p: any) => [p.id, p]));
    const binsByKey = new Map((packageBins || []).map((b: any) => [b.package_key, b]));

    const outOfStock: Array<{ productId: string; binWeight?: number; weight?: number }> = [];

    cart.items.forEach((item: any) => {
      // Pre-orders should bypass inventory checks since they can be ordered even if sold out
      if (item.isPreOrder) {
        return;
      }

      const product = productsById.get(item.productId);
      const packageKey = buildPackageKey(item.productId, product?.unit, item);
      const bin = binsByKey.get(packageKey);
      const reserved = bin?.reserved_qty ?? 0;
      const availableFromBin = bin ? Math.max(0, (bin.qty ?? 0) - reserved) : null;
      // Fallback to product.qty when bin is missing (each-based products)
      const available = availableFromBin !== null ? availableFromBin : (product?.qty ?? 0);
      const required = item.quantity ?? 1;

      if (!bin && (product?.unit || '').toLowerCase() === 'lb') {
        outOfStock.push({ productId: item.productId, binWeight: item.binWeight, weight: item.weight });
        return;
      }

      if (required > available) {
        outOfStock.push({ productId: item.productId, binWeight: item.binWeight, weight: item.weight });
      }
    });

    if (outOfStock.length > 0) {
      removeItems(outOfStock);

      const productName = (id: string) => storefrontData?.products?.find((p: any) => p.id === id)?.name || 'Item';
      const removedList = outOfStock
        .map((item) => {
          const name = productName(item.productId);
          if (item.binWeight) return `${name} (${item.binWeight} lb package)`;
          if (item.weight) return `${name} (${item.weight} lb)`;
          return name;
        })
        .join(', ');

      toast.error(`Removed unavailable items: ${removedList}`);
      return false;
    }

    return true;
  };

  // Save customer profile via secure Edge Function (service role)
  const saveCustomerProfile = async () => {
    if (!tenant?.id || !formData.customerEmail) {
      console.log('saveCustomerProfile skipped:', { tenantId: tenant?.id, email: formData.customerEmail });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('save-customer-profile', {
        body: {
          tenantId: tenant.id,
          full_name: formData.customerName,
          phone: formData.customerPhone || null,
          email: formData.customerEmail,
          email_notifications: subscribeToEmails,
        }
      });

      if (error) {
        console.error('Error saving customer profile (function):', error);
      } else {
        console.log('Customer profile saved via function:', data);
      }
    } catch (err) {
      console.error('Exception saving customer profile (function):', err);
    }
  };

  const handleInputChange = (field: keyof CheckoutData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleShippingAddressChange = (field: keyof ShippingAddress, value: string) => {
    setShippingAddress(prev => {
      const updated = { ...prev, [field]: value };
      if (formData.deliveryMethod === 'shipping') {
        setFormData(current => ({ ...current, deliveryAddress: formatShippingAddress(updated) }));
      }
      return updated;
    });
  };

  const handleStripeCheckout = async () => {
    if (!tenant || !storefrontData?.products) return;
    if (!cardPaymentAvailable) {
      alert('Card payments are not available for this store.');
      return;
    }

    // Save customer profile before redirecting to Stripe
    await saveCustomerProfile();

    try {
      // Prepare line items for Stripe
      const lineItems = cart.items.map((item: any) => {
        const product = storefrontData.products.find((p: any) => p.id === item.productId);
        const productName = product?.name || 'Product';
        
        // Calculate unit_amount based on item type
        let unitPriceInCents = 0;
        let itemQuantity = item.quantity || 1;
        
        if (item.binWeight && item.unitPriceCents) {
          // Pre-packaged weight bins: unitPriceCents is price per lb, multiply by binWeight
          unitPriceInCents = Math.round(item.binWeight * item.unitPriceCents);
          itemQuantity = item.quantity; // Quantity of bins
        } else if (item.weight && product?.pricingMode === 'weight') {
          // Custom weight entry: price per lb * weight
          // For weight items, the total price IS the unit price and quantity is 1
          unitPriceInCents = Math.round(item.weight * product.pricePer * 100);
          itemQuantity = 1; // Weight is already factored into the price
        } else if (item.weight && product?.unit?.toLowerCase() === 'lb') {
          // Handle weight-based items by unit
          unitPriceInCents = Math.round(item.weight * product.pricePer * 100);
          itemQuantity = 1; // Weight is already factored into the price
        } else if (item.unitPriceCents) {
          // Items with unitPriceCents explicitly stored (already in cents)
          unitPriceInCents = item.unitPriceCents;
          itemQuantity = item.quantity;
        } else if (product?.pricePer) {
          // Standard fixed pricing: convert dollars to cents
          unitPriceInCents = Math.round(product.pricePer * 100);
          itemQuantity = item.quantity;
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
          calculatedQuantity: itemQuantity,
          finalUnitPrice: unitPriceInCents,
          totalPrice: unitPriceInCents * itemQuantity
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
          quantity: itemQuantity,
        };
      });

      // Add shipping charge if applicable
      const shippingChargeCents = formData.deliveryMethod === 'shipping' 
        ? ((storefrontData?.settings as any)?.shipping_charge_cents || 0)
        : 0;
      
      if (shippingChargeCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Shipping',
              description: undefined,
              metadata: {
                product_id: 'shipping',
                binWeight: undefined,
                weight: undefined,
                unit: 'ea',
              },
            },
            unit_amount: shippingChargeCents,
          },
          quantity: 1,
        });
      }

      // Calculate tax if applicable
      const taxRate = tenant?.tax_rate ?? 0;
      const chargeTax = tenant?.charge_tax_on_online !== false;
      const taxIncluded = tenant?.tax_included ?? false;
      
      if (chargeTax && !taxIncluded && taxRate > 0) {
        // Calculate tax on subtotal minus discount (including shipping in taxable base)
        const subtotalAfterDiscount = cart.total + (shippingChargeCents / 100) - (discountCents / 100);
        const taxAmount = Math.round(subtotalAfterDiscount * 100 * taxRate);
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Tax',
              description: undefined,
              metadata: {
                product_id: 'tax',
                binWeight: undefined,
                weight: undefined,
                unit: 'ea',
              },
            },
            unit_amount: taxAmount,
          },
          quantity: 1,
        });
      }

      // Save form data to localStorage for order creation after payment
      const checkoutFormData = formData.deliveryMethod === 'shipping'
        ? { ...formData, deliveryAddress: formatShippingAddress(shippingAddress) }
        : formData;
      localStorage.setItem('checkout-form-data', JSON.stringify(checkoutFormData));
      
      console.log('💰 Creating Stripe checkout with discount:', {
        discountCents,
        discountCode: appliedDiscount?.code,
        appliedDiscount,
        cartTotal: cart.total,
        lineItemsTotal: lineItems.reduce((sum, item) => sum + (item.price_data.unit_amount * item.quantity), 0) / 100,
        expectedTotal: cart.total - (discountCents / 100),
      });
      
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
            delivery_address: checkoutFormData.deliveryAddress || '',
            delivery_notes: formData.deliveryNotes || '',
            fulfillment_location: formData.fulfillmentLocation || '',
            discount_cents: discountCents,
            discount_code: appliedDiscount?.code || '',
            shipping_cents: shippingChargeCents,
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

    if (formData.deliveryMethod === 'shipping') {
      if (!shippingAddress.street || !shippingAddress.city || !shippingAddress.state || !shippingAddress.zip) {
        alert('Please provide street, city, state, and ZIP for shipping.');
        return;
      }
      const formattedAddress = formatShippingAddress(shippingAddress);
      if (!formattedAddress) {
        alert('Please provide a full shipping address.');
        return;
      }
    }

    // Preflight: ensure cart items are still in stock; prune and notify if not
    const availabilityOk = await verifyAndPruneCart();
    if (!availabilityOk) {
      return;
    }

    // Save customer profile with email preference
    await saveCustomerProfile();

    const orderValue = cart.total - (discountCents / 100);

    // Handle Stripe checkout for card payments
    if (formData.paymentMethod === 'card') {
      if (!cardPaymentAvailable) {
        alert('Card payments are not available for this store. Please choose another method.');
        return;
      }
      await handleStripeCheckout();
      return;
    }
    // Build subscription payload
    console.log('🔍 Checking cart for subscription items:', cart.items);
    const subscriptionItem = cart.items.find((item: any) => item.metadata?.isSubscription);
    console.log('🔍 Found subscription item:', subscriptionItem);

    let subscriptionPayload = undefined;

    if (enableSubscription) {
      if (!selectedSubscriptionProductId) {
        alert('Please choose a subscription box.');
        return;
      }

      const selectedProduct = subscriptionProducts.find(
        (p) => p.id === selectedSubscriptionProductId
      );

      subscriptionPayload = {
        enabled: true,
        cadence: selectedProduct?.cadence,
        startDate: new Date().toISOString(),
        subscriptionProductId: selectedSubscriptionProductId,
        quantity: 1,
        substitutions: subscriptionSelections,
      };

      console.log('🔍 Subscription payload from checkout selection:', subscriptionPayload);
    } else if (subscriptionItem) {
      const metadata = (subscriptionItem as any).metadata;
      console.log('🔍 Subscription metadata from cart:', metadata);
      subscriptionPayload = {
        enabled: true,
        cadence: metadata.subscriptionInterval as 'weekly' | 'biweekly' | 'monthly',
        startDate: new Date().toISOString(),
        subscriptionProductId: metadata.subscriptionProductId,
        quantity: subscriptionItem.quantity,
        duration: metadata.duration,
        substitutions: metadata.substitutionSelections || metadata.substitutions || {},
      };
      console.log('🔍 Subscription payload from cart:', subscriptionPayload);
    } else {
      console.log('⚠️ No subscription item found in cart');
    }

    const shippingChargeCents = formData.deliveryMethod === 'shipping' 
      ? ((storefrontData?.settings as any)?.shipping_charge_cents || 0)
      : 0;

    const deliveryAddress = formData.deliveryMethod === 'shipping'
      ? formatShippingAddress(shippingAddress)
      : formData.deliveryAddress;

    const result = await createOrder(
  tenant.id,
  cart,
  storefrontData.products,
  {
    ...formData,
    deliveryAddress,
    subscription: subscriptionPayload,
    discountCents,
    shippingChargeCents,
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
  const cardPaymentAvailable = Boolean(
    tenant?.stripe_account_id &&
    (((storefrontData?.settings as any)?.enable_card ?? (storefrontData?.settings as any)?.allow_card ?? false))
  );

  useEffect(() => {
    if (!cardPaymentAvailable && formData.paymentMethod === 'card') {
      setFormData(prev => ({ ...prev, paymentMethod: 'cash' }));
    }
  }, [cardPaymentAvailable, formData.paymentMethod]);

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

  const cartItems = cart.items.map((item: any) => {
    const product = storefrontData?.products.find(p => p.id === item.productId);

    if (!product && item?.metadata?.isSubscription) {
      const meta = item.metadata || {};
      const subscriptionName = meta.subscriptionName || 'Subscription Box';
      const interval = meta.subscriptionInterval;
      const descParts = [subscriptionName];
      if (interval) descParts.push(`${interval} subscription`);

      const fallbackProduct = {
        id: item.productId,
        name: subscriptionName,
        description: descParts.join(' - '),
        pricePer: meta.subscriptionTotalPrice || 0,
        unit: 'ea',
        imageUrl: '/subscription-placeholder.png',
        categoryId: 'subscription',
        available: true,
        inventory: 1,
        subscriptionInterval: interval,
      } as any;

      return { ...item, product: fallbackProduct };
    }

    return product ? { ...item, product } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  // Calculate actual cart total based on items
  const cartTotal = cartItems.reduce((sum, item) => {
    if (!item?.product) return sum;
    
    const weight = (item as any).weight;
    const binWeight = (item as any).binWeight;
    const unitPriceCents = (item as any).unitPriceCents;
    const metaPrice: number | undefined = (item as any).metadata?.subscriptionTotalPrice;
    const quantity = item.quantity;
    
    let itemTotal = 0;
    
    if (binWeight && unitPriceCents) {
      itemTotal = binWeight * (unitPriceCents / 100) * quantity;
    } else if (weight && weight > 0) {
      itemTotal = item.product.pricePer * weight * quantity;
    } else if (metaPrice && metaPrice > 0) {
      itemTotal = metaPrice * quantity;
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

              {/* Fulfillment Method */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Fulfillment Method</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* Show Pickup if enabled */}
                  {(storefrontData?.settings as any)?.allow_pickup && (
                    <button
                      type="button"
                      onClick={() => {
                        handleInputChange('deliveryMethod', 'pickup');
                        handleInputChange('fulfillmentLocation', '');
                      }}
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
                  )}

                  {/* Show Shipping if enabled */}
                  {(storefrontData?.settings as any)?.allow_shipping && (
                    <button
                      type="button"
                      onClick={() => {
                        handleInputChange('deliveryMethod', 'shipping');
                        handleInputChange('fulfillmentLocation', '');
                      }}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                        formData.deliveryMethod === 'shipping'
                          ? 'border-current shadow-lg'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={formData.deliveryMethod === 'shipping' ? {
                        borderColor: primaryColor,
                        backgroundColor: `${primaryColor}08`,
                        boxShadow: `0 0 20px ${primaryColor}40`
                      } : {}}
                    >
                      <div className="text-center">
                        <div className="text-3xl mb-2">📮</div>
                        <div className="font-semibold text-gray-800">Shipping</div>
                        <div className="text-sm font-medium mt-1" style={{ color: primaryColor }}>
                          ${(((storefrontData?.settings as any)?.shipping_charge_cents || 0) / 100).toFixed(2)}
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Show Drops if enabled */}
                  {(storefrontData?.settings as any)?.allow_dropoff && (
                    <button
                      type="button"
                      onClick={() => {
                        handleInputChange('deliveryMethod', 'dropoff');
                        handleInputChange('fulfillmentLocation', '');
                      }}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                        formData.deliveryMethod === 'dropoff'
                          ? 'border-current shadow-lg'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={formData.deliveryMethod === 'dropoff' ? {
                        borderColor: primaryColor,
                        backgroundColor: `${primaryColor}08`,
                        boxShadow: `0 0 20px ${primaryColor}40`
                      } : {}}
                    >
                      <div className="text-center">
                        <div className="text-3xl mb-2">📍</div>
                        <div className="font-semibold text-gray-800">Drop</div>
                        <div className="text-sm font-medium mt-1" style={{ color: primaryColor }}>Free</div>
                      </div>
                    </button>
                  )}

                  {/* Show Other if enabled */}
                  {(storefrontData?.settings as any)?.allow_other && (
                    <button
                      type="button"
                      onClick={() => {
                        handleInputChange('deliveryMethod', 'other');
                        handleInputChange('fulfillmentLocation', '');
                      }}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 ${
                        formData.deliveryMethod === 'other'
                          ? 'border-current shadow-lg'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={formData.deliveryMethod === 'other' ? {
                        borderColor: primaryColor,
                        backgroundColor: `${primaryColor}08`,
                        boxShadow: `0 0 20px ${primaryColor}40`
                      } : {}}
                    >
                      <div className="text-center">
                        <div className="text-3xl mb-2">🔄</div>
                        <div className="font-semibold text-gray-800">Other</div>
                        <div className="text-sm text-gray-500 mt-1">Arrange</div>
                      </div>
                    </button>
                  )}
                </div>

                {/* Pickup Location Selector */}
                {formData.deliveryMethod === 'pickup' && (storefrontData?.settings as any)?.pickup_locations?.length > 0 && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Pickup Location *
                    </label>
                    <select
                      required
                      value={formData.fulfillmentLocation || ''}
                      onChange={(e) => handleInputChange('fulfillmentLocation', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                      onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                      onBlur={(e) => e.currentTarget.style.borderColor = ''}
                    >
                      <option value="">Choose a location...</option>
                      {((storefrontData?.settings as any)?.pickup_locations || []).map((location: any, index: number) => (
                        <option key={index} value={`${location.name} - ${location.address}`}>
                          {location.name} - {location.address}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Drop Location Selector */}
                {formData.deliveryMethod === 'dropoff' && (storefrontData?.settings as any)?.dropoff_locations?.length > 0 && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Drop Location *
                    </label>
                    <select
                      required
                      value={formData.fulfillmentLocation || ''}
                      onChange={(e) => handleInputChange('fulfillmentLocation', e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                      onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                      onBlur={(e) => e.currentTarget.style.borderColor = ''}
                    >
                      <option value="">Choose a drop...</option>
                      {((storefrontData?.settings as any)?.dropoff_locations || []).map((location: any, index: number) => (
                        <option key={index} value={formatDropLocation(location)}>
                          {formatDropLocation(location)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Shipping Address Input */}
                {formData.deliveryMethod === 'shipping' && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Shipping Address *
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        type="text"
                        required
                        value={shippingAddress.street}
                        onChange={(e) => handleShippingAddressChange('street', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                        onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        placeholder="Street address"
                      />
                      <input
                        type="text"
                        required
                        value={shippingAddress.city}
                        onChange={(e) => handleShippingAddressChange('city', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                        onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        placeholder="City"
                      />
                      <input
                        type="text"
                        required
                        value={shippingAddress.state}
                        onChange={(e) => handleShippingAddressChange('state', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                        onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        placeholder="State"
                      />
                      <input
                        type="text"
                        required
                        value={shippingAddress.zip}
                        onChange={(e) => handleShippingAddressChange('zip', e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                        onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                        onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        placeholder="ZIP / Postal code"
                      />
                    </div>
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

                  {cardPaymentAvailable && (
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
                  )}

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

                {/* Subscription Section */}
                {subscriptionProducts.length > 0 && (
                  <div className="mt-6 border-t pt-6">
                    <div className="flex items-center gap-3 mb-4">
                      <input
                        type="checkbox"
                        id="enableSubscription"
                        checked={enableSubscription}
                        onChange={(e) => {
                          setEnableSubscription(e.target.checked);
                          if (!e.target.checked) {
                            setSelectedSubscriptionProductId('');
                            setSubscriptionSelections({});
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 focus:ring-2"
                        style={{ accentColor: primaryColor }}
                      />
                      <label
                        htmlFor="enableSubscription"
                        className="text-sm font-medium text-gray-700 cursor-pointer"
                      >
                        Add a subscription to this order
                      </label>
                    </div>

                    {enableSubscription && (
                      <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Choose Subscription Box *
                          </label>
                          {loadingSubscriptionProducts ? (
                            <div className="text-sm text-gray-500">Loading subscription options...</div>
                          ) : (
                            <select
                              value={selectedSubscriptionProductId}
                              onChange={(e) => {
                                setSelectedSubscriptionProductId(e.target.value);
                                setSubscriptionSelections({});
                              }}
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                              style={{ borderColor: enableSubscription ? primaryColor : '' }}
                            >
                              <option value="">Select a box...</option>
                              {subscriptionProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} - ${product.price_per_interval.toFixed(2)} ({product.interval_type})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        {selectedSubscriptionProductId && (
                          <SubscriptionBoxSelector
                            subscriptionProductId={selectedSubscriptionProductId}
                            primaryColor={primaryColor}
                            onSelectionChange={(selections) => {
                              setSubscriptionSelections(selections);
                              // Update form with subscription data
                              setFormData((prev) => ({
                                ...prev,
                                subscription: {
                                  enabled: true,
                                  cadence: subscriptionProducts.find(
                                    (p) => p.id === selectedSubscriptionProductId
                                  )?.cadence,
                                  startDate: new Date().toISOString(),
                                  subscriptionProductId: selectedSubscriptionProductId,
                                  quantity: 1,
                                  substitutions: selections,
                                },
                              }));
                            }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
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
                    const metaPrice = item.metadata?.subscriptionTotalPrice;
                    
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
                    } else if (metaPrice && metaPrice > 0) {
                      displayText = `${item.product.name} (${(item.product as any).subscriptionInterval || 'subscription'})`;
                      itemTotal = metaPrice * item.quantity;
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
                    {formData.deliveryMethod === 'shipping' && (storefrontData?.settings as any)?.shipping_charge_cents > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Shipping:</span>
                        <span>${(((storefrontData?.settings as any)?.shipping_charge_cents || 0) / 100).toFixed(2)}</span>
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
      const shippingCharge = formData.deliveryMethod === 'shipping' 
        ? (((storefrontData?.settings as any)?.shipping_charge_cents || 0) / 100)
        : 0;
      const tax = tenant?.charge_tax_on_online === false
        ? 0
        : tenant?.tax_included
        ? 0
        : subtotal * (tenant?.tax_rate ?? 0);
      const total = tenant?.charge_tax_on_online === false
        ? subtotal + shippingCharge
        : tenant?.tax_included
        ? subtotal + shippingCharge
        : subtotal + tax + shippingCharge;
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

              {/* Email Opt-in Checkbox */}
              <div className="mt-6 flex items-start gap-3 bg-blue-50 p-4 rounded-lg border border-blue-100">
                <input
                  type="checkbox"
                  id="subscribeToEmails"
                  checked={subscribeToEmails}
                  onChange={(e) => setSubscribeToEmails(e.target.checked)}
                  className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  style={{ accentColor: primaryColor }}
                />
                <label htmlFor="subscribeToEmails" className="text-sm text-gray-700 cursor-pointer">
                  Subscribe to our email list for sales, restocks, and exclusive updates
                </label>
              </div>

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