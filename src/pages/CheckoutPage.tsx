import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { useStorefrontData } from '../hooks/useStorefrontData';
import { useCart } from '../context/CartContext';
import { useCheckout, type CheckoutData, type GroupChoice } from '../hooks/useCheckout';
import { SubscriptionBoxSelector } from '../components/SubscriptionBoxSelector';
import { StripeAuthorizationForm } from '../components/StripeAuthorizationForm';
import { StripeInlineCardForm, type StripeCardFormHandle } from '../components/StripeInlineCardForm';
import { CartValidationModal } from '../components/CartValidationModal';
import { ONLINE_PAYMENT_FEE_LABEL, addOnlinePaymentFee, getOnlinePaymentFeeCents } from '../lib/onlinePaymentFee';
import { trackBeginCheckout, trackPurchase } from '../utils/analytics';
import { friendlyOrderError, isInventoryOrderError } from '../utils/orderErrors';
import { supabase } from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const platformStripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '';

interface Discount {
  id: string;
  name: string;
  coupon_code?: string;
  is_percentage: boolean;
  discount_amount: number;
  is_active: boolean;
}

interface DeliveryDateOption {
  delivery_date: string;
  remaining_slots: number;
  max_deliveries: number;
  is_available: boolean;
}

export function CheckoutPage() {
  const isDev = import.meta.env.DEV;

  const navigate = useNavigate();
  const { tenant } = useTenantFromDomain();
  const { data: storefrontData, loading: dataLoading } = useStorefrontData(tenant?.id || '');
  const { cart, clearCart, updateCartTotal, removeItems } = useCart();
  const { createOrder, loading: checkoutLoading, error: checkoutError } = useCheckout();

  // Load Stripe with the platform key scoped to the tenant's connected account
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  useEffect(() => {
    if (platformStripeKey && tenant?.stripe_account_id) {
      setStripePromise(loadStripe(platformStripeKey, { stripeAccount: tenant.stripe_account_id }));
    }
  }, [tenant?.stripe_account_id]);

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
    requestedDeliveryDate: '',
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
  const [shippingAddressInput, setShippingAddressInput] = useState('');

  const [shippingEstimate, setShippingEstimate] = useState<{
    estimate_cents: number | null;
    range_low_cents: number;
    range_high_cents: number;
    service_label: string;
    transit_days: number;
    reason?: string;
    num_packages?: number;
    packages?: Array<{
      package_type: "cold" | "ambient";
      service: string;
      transit_days: number;
      customer_charge_cents: number;
      dry_ice_lbs: number;
    }>;
    breakdown?: {
      carrier_cents: number;
      carrier_with_markup_cents: number;
      dry_ice_lbs: number;
      dry_ice_cost_cents: number;
      box_cost_cents: number;
      materials_total_cents: number;
      markup_percent: number;
      num_packages?: number;
      has_cold?: boolean;
      has_ambient?: boolean;
    };
  } | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [shippingSuggestions, setShippingSuggestions] = useState<string[]>([]);
  const [showShippingSuggestions, setShowShippingSuggestions] = useState(false);
  const [loadingShippingSuggestions, setLoadingShippingSuggestions] = useState(false);
  const shippingAutocompleteTimeoutRef = useRef<number | null>(null);

  // Delivery zone state
  const [deliveryAddress, setDeliveryAddress] = useState<ShippingAddress>({
    street: '',
    city: '',
    state: '',
    zip: '',
  });
  const [deliveryAddressInput, setDeliveryAddressInput] = useState('');
  const [deliveryGeoResult, setDeliveryGeoResult] = useState<{
    distance_miles: number;
    matched_zone: { id: string; label: string; charge_cents: number } | null;
    formatted_address: string;
  } | null>(null);
  const [geocodingDelivery, setGeocodingDelivery] = useState(false);
  const [deliverySuggestions, setDeliverySuggestions] = useState<string[]>([]);
  const [showDeliverySuggestions, setShowDeliverySuggestions] = useState(false);
  const [loadingDeliverySuggestions, setLoadingDeliverySuggestions] = useState(false);
  const deliveryAutocompleteTimeoutRef = useRef<number | null>(null);
  const [deliveryError, setDeliveryError] = useState('');
  const [deliveryDateOptions, setDeliveryDateOptions] = useState<DeliveryDateOption[]>([]);
  const [deliveryDatesLoading, setDeliveryDatesLoading] = useState(false);
  const [deliveryDatesError, setDeliveryDatesError] = useState<string | null>(null);
  const [showDeliveryDateModal, setShowDeliveryDateModal] = useState(false);
  const [deliveryCalendarMonth, setDeliveryCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [subscribeToEmails, setSubscribeToEmails] = useState(false);
  
  // Subscription state
  const [subscriptionProducts, setSubscriptionProducts] = useState<any[]>([]);
  const [enableSubscription, setEnableSubscription] = useState(false);
  const [selectedSubscriptionProductId, setSelectedSubscriptionProductId] = useState('');
  const [subscriptionSelections, setSubscriptionSelections] = useState<Record<string, GroupChoice[]>>({});
  const [loadingSubscriptionProducts, setLoadingSubscriptionProducts] = useState(false);
  const payLaterOptions = [
    (storefrontData?.settings as any)?.enable_cash ? 'Cash' : null,
    (storefrontData?.settings as any)?.enable_cashapp ? 'CashApp' : null,
  ].filter(Boolean) as string[];
  const externalPaymentOptions = [
    (storefrontData?.settings as any)?.enable_venmo ? {
      method: 'venmo' as const,
      label: 'Venmo',
      qrUrl: (storefrontData?.settings as any)?.venmo_qr_url as string | null | undefined,
      detailLabel: 'Venmo handle',
      detail: (storefrontData?.settings as any)?.venmo_handle as string | undefined,
    } : null,
    (storefrontData?.settings as any)?.enable_zelle ? {
      method: 'zelle' as const,
      label: 'Zelle',
      qrUrl: (storefrontData?.settings as any)?.zelle_qr_url as string | null | undefined,
      detailLabel: 'Zelle details',
      detail: (storefrontData?.settings as any)?.zelle_instructions as string | undefined,
    } : null,
  ].filter(Boolean) as Array<{
    method: 'venmo' | 'zelle';
    label: string;
    qrUrl?: string | null;
    detailLabel: string;
    detail?: string;
  }>;
  const hasDepositProductInCart = cart.items.some((item: any) => {
    const storefrontProduct = storefrontData?.products?.find((product: any) => product.id === item.productId);
    return Boolean(item?.is_deposit_product || item?.metadata?.isDepositProduct || storefrontProduct?.is_deposit_product);
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
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string>();
  const [needsStripeConfirmation, setNeedsStripeConfirmation] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [dismissedCheckoutError, setDismissedCheckoutError] = useState(false);
  const stripeCardRef = useRef<StripeCardFormHandle>(null);
  
  // Discount state
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [discountsLoading, setDiscountsLoading] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string; amount: number; percent: number } | null>(null);
  const [discountCents, setDiscountCents] = useState(0);
  
  // Cart validation modal state
  const [showCartValidationModal, setShowCartValidationModal] = useState(false);
  const [removedItemsData, setRemovedItemsData] = useState<Array<{
    productId: string;
    productName: string;
    binWeight?: number;
    weight?: number;
    requestedWeightLbs?: number;
    lineType?: 'exact_package' | 'pack_for_you';
    variantUnit?: string;
    isEach?: boolean;
    canPreOrder?: boolean;
    available?: number;
    requested?: number;
  }>>([]);

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

  const formatDeliveryAddress = (addr: ShippingAddress): string => {
    return [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
  };

  const normalizeZip = (value: string) => value.replace(/\D/g, '').slice(0, 5);

  const normalizeState = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.length <= 2 ? trimmed.toUpperCase() : trimmed;
  };

  const normalizeAddress = (address: ShippingAddress): ShippingAddress => ({
    street: address.street.trim(),
    city: address.city.trim(),
    state: normalizeState(address.state),
    zip: normalizeZip(address.zip),
  });

  const parseSavedAddress = (value: string): ShippingAddress | null => {
    if (!value?.trim()) return null;

    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    let street = '';
    let city = '';
    let state = '';
    let zip = '';

    if (parts.length >= 2) {
      street = parts[0];
      city = parts[1];

      // Handles both "City, ST 12345" and "City, ST 12345, USA".
      const trailingStateZipMatch = value.match(/,\s*([^,]+?)\s+(\d{5}(?:-\d{4})?)(?:\s*,\s*[^,]+)?\s*$/);
      if (trailingStateZipMatch) {
        state = trailingStateZipMatch[1];
        zip = trailingStateZipMatch[2];
      } else {
        const stateZipCandidate = parts.slice(2).join(' ');
        const stateZipMatch = stateZipCandidate.match(/([A-Za-z]{2}|[A-Za-z .'-]+)\s+(\d{5}(?:-\d{4})?)/);
        if (stateZipMatch) {
          state = stateZipMatch[1];
          zip = stateZipMatch[2];
        } else if (parts.length >= 4) {
          state = parts[2];
          zip = parts[3];
        } else if (parts.length === 3) {
          state = parts[2];
        }
      }
    } else {
      return null;
    }

    const parsed = normalizeAddress({ street, city, state, zip });
    return parsed.street && parsed.city && parsed.state && parsed.zip ? parsed : null;
  };

  const isAddressBlank = (address: ShippingAddress) => {
    return !address.street.trim() && !address.city.trim() && !address.state.trim() && !address.zip.trim();
  };

  const hasCompleteShippingAddress = (address: ShippingAddress) => {
    const normalized = normalizeAddress(address);
    return Boolean(
      normalized.street &&
      normalized.city &&
      normalized.state &&
      /^\d{5}$/.test(normalized.zip)
    );
  };

  const resolveAddressFromInput = async (rawInput: string): Promise<{
    normalizedAddress: ShippingAddress;
    formattedAddress: string;
  } | null> => {
    const trimmed = rawInput.trim();
    if (!trimmed) return null;

    const parsedInput = parseSavedAddress(trimmed);
    if (parsedInput && hasCompleteShippingAddress(parsedInput)) {
      const normalizedAddress = normalizeAddress(parsedInput);
      return {
        normalizedAddress,
        formattedAddress: formatShippingAddress(normalizedAddress),
      };
    }

    try {
      const { data, error } = await supabase!.functions.invoke('geocode-address', {
        body: { address: trimmed },
      });

      if (error || !data?.formatted_address) {
        return null;
      }

      const parsedGeocoded = parseSavedAddress(data.formatted_address);
      if (!parsedGeocoded || !hasCompleteShippingAddress(parsedGeocoded)) {
        return null;
      }

      const normalizedAddress = normalizeAddress(parsedGeocoded);
      return {
        normalizedAddress,
        formattedAddress: formatShippingAddress(normalizedAddress),
      };
    } catch {
      return null;
    }
  };

  const deliveryDateSchedulingEnabled = Boolean(
    (storefrontData?.settings as any)?.delivery_date_scheduling_enabled &&
    Number((storefrontData?.settings as any)?.delivery_max_per_day ?? 0) > 0
  );

  const deliveryDateWindowDays = Math.max(
    1,
    Number((storefrontData?.settings as any)?.delivery_date_window_days ?? 14)
  );

  const deliveryLeadTimeDays = Math.max(
    0,
    Number((storefrontData?.settings as any)?.delivery_lead_time_days ?? 0)
  );

  const getLocalIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const minimumDeliveryDateIso = (() => {
    const date = new Date();
    date.setDate(date.getDate() + deliveryLeadTimeDays);
    return getLocalIsoDate(date);
  })();

  const formatDeliveryDateLabel = (isoDate: string) => {
    const date = new Date(`${isoDate}T00:00:00`);
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const parseIsoDate = (isoDate: string) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
  };

  const toIsoDate = (date: Date) => {
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
  };

  const fallbackDeliveryDateOptions: DeliveryDateOption[] = Array.from({ length: deliveryDateWindowDays }, (_, index) => {
    const date = parseIsoDate(minimumDeliveryDateIso);
    date.setDate(date.getDate() + index);
    return {
      delivery_date: toIsoDate(date),
      remaining_slots: 1,
      max_deliveries: 1,
      is_available: true,
    };
  });

  const calendarDeliveryDateOptions = deliveryDateSchedulingEnabled
    ? deliveryDateOptions
    : fallbackDeliveryDateOptions;

  const availableDateMap = new Map(calendarDeliveryDateOptions.map((option) => [option.delivery_date, option]));
  const horizonStartDate = parseIsoDate(minimumDeliveryDateIso);
  const horizonEndDate = new Date(horizonStartDate);
  horizonEndDate.setDate(horizonEndDate.getDate() + Math.max(deliveryDateWindowDays - 1, 0));
  const firstHorizonMonth = new Date(horizonStartDate.getFullYear(), horizonStartDate.getMonth(), 1);
  const lastHorizonMonth = new Date(horizonEndDate.getFullYear(), horizonEndDate.getMonth(), 1);
  const firstAvailableDateIso = calendarDeliveryDateOptions[0]?.delivery_date;

  const canGoPrevMonth = Boolean(
    deliveryCalendarMonth.getFullYear() > firstHorizonMonth.getFullYear() ||
    (deliveryCalendarMonth.getFullYear() === firstHorizonMonth.getFullYear() &&
      deliveryCalendarMonth.getMonth() > firstHorizonMonth.getMonth())
  );

  const canGoNextMonth = Boolean(
    deliveryCalendarMonth.getFullYear() < lastHorizonMonth.getFullYear() ||
    (deliveryCalendarMonth.getFullYear() === lastHorizonMonth.getFullYear() &&
      deliveryCalendarMonth.getMonth() < lastHorizonMonth.getMonth())
  );

  const openDeliveryDateModal = () => {
    const seedDateIso = formData.requestedDeliveryDate || firstAvailableDateIso || minimumDeliveryDateIso;
    const seedDate = parseIsoDate(seedDateIso);
    setDeliveryCalendarMonth(new Date(seedDate.getFullYear(), seedDate.getMonth(), 1));
    setShowDeliveryDateModal(true);
  };

  const loadDeliveryDateAvailability = async () => {
    if (!tenant?.id || !deliveryDateSchedulingEnabled) {
      setDeliveryDateOptions([]);
      setDeliveryDatesError(null);
      return;
    }

    setDeliveryDatesLoading(true);
    setDeliveryDatesError(null);

    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase.rpc('get_storefront_delivery_date_availability', {
        p_tenant_id: tenant.id,
        p_start_date: todayIso,
        p_days: deliveryDateWindowDays,
      });

      if (error) throw error;

      const options = Array.isArray(data)
        ? (data as DeliveryDateOption[]).filter((option) => option.is_available)
        : [];

      setDeliveryDateOptions(options);

      if (options.length === 0) {
        setDeliveryDatesError('No delivery dates are currently available. Please choose pickup or shipping.');
      }
    } catch (err) {
      console.error('Failed to load delivery date availability:', err);
      setDeliveryDateOptions([]);
      setDeliveryDatesError('Unable to load delivery dates right now. Please try again.');
    } finally {
      setDeliveryDatesLoading(false);
    }
  };

  useEffect(() => {
    if (formData.deliveryMethod !== 'delivery') return;
    if (!deliveryDateSchedulingEnabled) {
      setDeliveryDateOptions([]);
      setDeliveryDatesError(null);
      return;
    }

    void loadDeliveryDateAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.deliveryMethod, tenant?.id, deliveryDateSchedulingEnabled, deliveryDateWindowDays]);

  useEffect(() => {
    if (formData.deliveryMethod !== 'delivery') return;
    if (!deliveryDateSchedulingEnabled) return;
    if (formData.requestedDeliveryDate) return;
    if (deliveryDateOptions.length === 0) return;

    handleInputChange('requestedDeliveryDate', deliveryDateOptions[0].delivery_date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryDateOptions, formData.deliveryMethod, formData.requestedDeliveryDate, deliveryDateSchedulingEnabled]);

  useEffect(() => {
    if (formData.deliveryMethod !== 'delivery') return;
    if (deliveryDateSchedulingEnabled) return;
    if (formData.requestedDeliveryDate) return;

    handleInputChange('requestedDeliveryDate', minimumDeliveryDateIso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.deliveryMethod, formData.requestedDeliveryDate, deliveryDateSchedulingEnabled, minimumDeliveryDateIso]);

  useEffect(() => {
    if (!deliveryAddressInput && formData.deliveryAddress) {
      setDeliveryAddressInput(formData.deliveryAddress);
    }

    if (!isAddressBlank(deliveryAddress)) return;
    if (!formData.deliveryAddress) return;

    const parsed = parseSavedAddress(formData.deliveryAddress);
    if (parsed) {
      setDeliveryAddress(parsed);
      setDeliveryAddressInput(formData.deliveryAddress);
    }
  }, [formData.deliveryAddress, deliveryAddress, deliveryAddressInput]);

  const buildBinKey = (productId: string, binWeight?: number) => {
    const weightBtn = Math.round((binWeight ?? 0) * 100) / 100;
    const safeWeight = Number.isFinite(weightBtn) ? weightBtn : 0;
    return `${productId}|${safeWeight}`;
  };

  const verifyAndPruneCart = async (): Promise<boolean> => {
    if (!tenant?.id || cart.items.length === 0) return true;

    const productIds = Array.from(new Set(cart.items.map((i: any) => i.productId)));

    const [{ data: latestProducts, error: prodError }, { data: packageBins, error: binError }] = await Promise.all([
      supabase.from('products').select('id, unit, qty, is_deposit_product').eq('tenant_id', tenant.id).in('id', productIds),
      supabase.from('package_bins').select('product_id, weight_btn, qty, reserved_qty, bin_kind, qty_lbs, reserved_lbs').eq('tenant_id', tenant.id).in('product_id', productIds),
    ]);

    if (prodError || binError) {
      console.error('Inventory preflight failed:', { prodError, binError });
      toast.error('Could not verify inventory. Please try again.');
      return false;
    }

    const productsById = new Map((latestProducts || []).map((p: any) => [p.id, p]));
    const storefrontById = new Map((storefrontData?.products || []).map((p: any) => [p.id, p]));
    const binsByKey = new Map(
      (packageBins || []).map((b: any) => [buildBinKey(b.product_id, b.weight_btn), b])
    );
    const bulkBinsByProduct = new Map(
      (packageBins || [])
        .filter((b: any) => b.bin_kind === 'bulk_weight')
        .map((b: any) => [b.product_id, b])
    );

    const outOfStock: Array<{ productId: string; binWeight?: number; weight?: number; requestedWeightLbs?: number; lineType?: 'exact_package' | 'pack_for_you' }> = [];

    cart.items.forEach((item: any) => {
      // Pre-orders should bypass inventory checks since they can be ordered even if sold out
      if (item.isPreOrder) {
        return;
      }

      const product = productsById.get(item.productId);
      const storefrontProduct = storefrontById.get(item.productId);
      const isDeposit = Boolean(product?.is_deposit_product || storefrontProduct?.is_deposit_product);
      const isSubscription = Boolean(item?.metadata?.isSubscription || storefrontProduct?.isSubscription);
      const hasBinSelection = item.binWeight !== undefined && item.binWeight !== null;
      const binKey = hasBinSelection ? buildBinKey(item.productId, item.binWeight) : null;
      const bin = binKey ? binsByKey.get(binKey) : undefined;
      const bulkBin = bulkBinsByProduct.get(item.productId);
      const isPackForYou = item.lineType === 'pack_for_you';
      const requestedWeight = item.requestedWeightLbs ?? item.weight;
      if (isPackForYou && bulkBin && requestedWeight) {
        const availableBulk = Math.max(0, (bulkBin.qty_lbs ?? 0) - (bulkBin.reserved_lbs ?? 0));
        const requiredBulk = requestedWeight * (item.quantity ?? 1);
        if (requiredBulk > availableBulk) {
          outOfStock.push({ productId: item.productId, binWeight: item.binWeight, weight: item.weight, requestedWeightLbs: item.requestedWeightLbs, lineType: item.lineType });
        }
        return;
      }

      const reserved = bin?.reserved_qty ?? 0;
      const availableFromBin = bin ? Math.max(0, (bin.qty ?? 0) - reserved) : null;
      const availableFromProduct = typeof product?.qty === 'number'
        ? product.qty
        : (typeof storefrontProduct?.inventory === 'number' ? storefrontProduct.inventory : 0);
      // Fallback to product.qty when bin is missing (pack-for-you / weight entries)
      const available = availableFromBin !== null ? availableFromBin : availableFromProduct;
      const unitWeight = item.weight ?? item.requestedWeightLbs;
      const required = (isDeposit || isSubscription)
        ? (item.quantity ?? 1)
        : (unitWeight ? unitWeight * (item.quantity ?? 1) : (item.quantity ?? 1));

      if (hasBinSelection && !bin) {
        outOfStock.push({ productId: item.productId, binWeight: item.binWeight, weight: item.weight, requestedWeightLbs: item.requestedWeightLbs, lineType: item.lineType });
        return;
      }

      if (required > available) {
        outOfStock.push({ productId: item.productId, binWeight: item.binWeight, weight: item.weight, requestedWeightLbs: item.requestedWeightLbs, lineType: item.lineType });
      }
    });

    if (outOfStock.length > 0) {
      // Build detailed information about removed items for modal
      const removedItemsInfo = outOfStock.map((item) => {
        const storefrontProduct = storefrontData?.products?.find((p: any) => p.id === item.productId);
        const productName = storefrontProduct?.name || 'Item';
        const isEach = ((storefrontProduct?.unit) || '').toLowerCase() === 'ea' || Boolean((storefrontProduct as any)?.variantSize || (storefrontProduct as any)?.variantUnit);
        const variantUnit = (storefrontProduct as any)?.variantUnit;
        const canPreOrder = Boolean(storefrontProduct?.allowPreOrder);
        
        // Calculate available and requested amounts
        const cartItem = cart.items.find((i: any) => 
          i.productId === item.productId &&
          i.binWeight === item.binWeight &&
          i.weight === item.weight &&
          i.requestedWeightLbs === item.requestedWeightLbs &&
          i.lineType === item.lineType
        );
        
        const hasBinSelection = item.binWeight !== undefined && item.binWeight !== null;
        const binKey = hasBinSelection ? buildBinKey(item.productId, item.binWeight) : null;
        const bin = binKey ? binsByKey.get(binKey) : undefined;
        const availableFromBin = bin ? Math.max(0, (bin.qty ?? 0) - (bin.reservedQty ?? 0)) : null;
        const product = productsById.get(item.productId);
        const availableFromProduct = typeof product?.qty === 'number'
          ? product.qty
          : (typeof storefrontProduct?.inventory === 'number' ? storefrontProduct.inventory : 0);
        const available = availableFromBin !== null ? availableFromBin : availableFromProduct;
        const requested = (cartItem as any)?.quantity ?? 1;

        return {
          productId: item.productId,
          productName,
          binWeight: item.binWeight,
          weight: item.weight,
          requestedWeightLbs: item.requestedWeightLbs,
          lineType: item.lineType,
          variantUnit,
          isEach,
          canPreOrder,
          available,
          requested,
        };
      });

      // Remove all out of stock items from cart
      removeItems(outOfStock);

      // Show modal with removed items
      setRemovedItemsData(removedItemsInfo);
      setShowCartValidationModal(true);
      
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

  const handleShippingAddressInputChange = (value: string) => {
    setShippingAddressInput(value);
    setShippingAddress({ street: value, city: '', state: '', zip: '' });
    setShippingEstimate(null);
    setEstimateError(null);

    if (formData.deliveryMethod === 'shipping') {
      handleInputChange('deliveryAddress', value);
    }

    if (showShippingSuggestions || value.trim().length >= 4) {
      scheduleAddressSuggestions('shipping', { street: value, city: '', state: '', zip: '' });
    }
  };

  const handleDeliveryAddressInputChange = (value: string) => {
    setDeliveryAddressInput(value);
    setDeliveryAddress({ street: value, city: '', state: '', zip: '' });
    setDeliveryGeoResult(null);
    setDeliveryError('');

    if (formData.deliveryMethod === 'delivery') {
      handleInputChange('deliveryAddress', value);
    }

    if (showDeliverySuggestions || value.trim().length >= 4) {
      scheduleAddressSuggestions('delivery', { street: value, city: '', state: '', zip: '' });
    }
  };

  const resolveShippingAddressInput = async () => {
    const resolved = await resolveAddressFromInput(shippingAddressInput);
    if (!resolved) {
      if (shippingAddressInput.trim()) {
        setEstimateError('Please enter a complete shipping address and select a valid match.');
      }
      return null;
    }

    setShippingAddress(resolved.normalizedAddress);
    setShippingAddressInput(resolved.formattedAddress);
    setShowShippingSuggestions(false);
    setShippingSuggestions([]);
    setEstimateError(null);

    if (formData.deliveryMethod === 'shipping') {
      handleInputChange('deliveryAddress', resolved.formattedAddress);
    }

    await fetchShippingEstimate(resolved.normalizedAddress);
    return resolved;
  };

  const resolveDeliveryAddressInput = async () => {
    const resolved = await resolveAddressFromInput(deliveryAddressInput);
    if (!resolved) {
      if (deliveryAddressInput.trim()) {
        setDeliveryError('Please enter a complete delivery address and select a valid match.');
      }
      return null;
    }

    setDeliveryAddress(resolved.normalizedAddress);
    setDeliveryAddressInput(resolved.formattedAddress);
    setShowDeliverySuggestions(false);
    setDeliverySuggestions([]);
    setDeliveryGeoResult(null);
    setDeliveryError('');
    handleInputChange('deliveryAddress', resolved.formattedAddress);
    return resolved;
  };

  const getGeocodeErrorMessage = async (error: any): Promise<string> => {
    try {
      const context = error?.context;
      if (context?.json) {
        const payload = await context.json();
        if (payload?.error && typeof payload.error === 'string') {
          return payload.error;
        }
      }
    } catch {
      // Fall back to generic message below
    }

    return 'Could not verify address. Please check and try again.';
  };

  const fetchAddressSuggestions = async (query: string): Promise<string[]> => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 4) return [];

    try {
      const { data, error } = await supabase!.functions.invoke('address-autocomplete', {
        body: {
          query: trimmed,
          country: 'us',
        },
      });

      if (error || !Array.isArray(data?.suggestions)) {
        return [];
      }

      return data.suggestions
        .map((item: any) => (typeof item?.description === 'string' ? item.description : ''))
        .filter(Boolean)
        .slice(0, 6);
    } catch (err) {
      console.warn('Address autocomplete failed:', err);
      return [];
    }
  };

  const buildAutocompleteQuery = (address: ShippingAddress) => {
    return [address.street, address.city, address.state, address.zip]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(', ');
  };

  const scheduleAddressSuggestions = (mode: 'shipping' | 'delivery', address: ShippingAddress) => {
    const query = buildAutocompleteQuery(address);
    const timeoutRef = mode === 'shipping' ? shippingAutocompleteTimeoutRef : deliveryAutocompleteTimeoutRef;
    const setLoading = mode === 'shipping' ? setLoadingShippingSuggestions : setLoadingDeliverySuggestions;
    const setSuggestions = mode === 'shipping' ? setShippingSuggestions : setDeliverySuggestions;
    const setVisible = mode === 'shipping' ? setShowShippingSuggestions : setShowDeliverySuggestions;

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    if (query.length < 4) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    timeoutRef.current = window.setTimeout(async () => {
      const suggestions = await fetchAddressSuggestions(query);
      setSuggestions(suggestions);
      setVisible(suggestions.length > 0);
      setLoading(false);
    }, 220);
  };

  const applySuggestedAddress = async (mode: 'shipping' | 'delivery', suggestion: string) => {
    const normalizedFallback = normalizeAddress(parseSavedAddress(suggestion) || {
      street: mode === 'shipping' ? shippingAddress.street : deliveryAddress.street,
      city: mode === 'shipping' ? shippingAddress.city : deliveryAddress.city,
      state: mode === 'shipping' ? shippingAddress.state : deliveryAddress.state,
      zip: mode === 'shipping' ? shippingAddress.zip : deliveryAddress.zip,
    });

    let resolvedAddress = normalizedFallback;
    let formattedAddress = suggestion;

    try {
      const { data, error } = await supabase!.functions.invoke('geocode-address', {
        body: { address: suggestion },
      });

      if (!error && data?.formatted_address) {
        formattedAddress = data.formatted_address;
        const parsed = parseSavedAddress(data.formatted_address);
        if (parsed) {
          resolvedAddress = normalizeAddress(parsed);
        }
      }
    } catch (err) {
      console.warn('Address resolve failed, using suggestion fallback:', err);
    }

    if (mode === 'shipping') {
      setShippingAddress(resolvedAddress);
      setShippingAddressInput(formattedAddress);
      setShowShippingSuggestions(false);
      setShippingSuggestions([]);
      setEstimateError(null);

      if (formData.deliveryMethod === 'shipping') {
        handleInputChange('deliveryAddress', formattedAddress);
      }

      if (hasCompleteShippingAddress(resolvedAddress)) {
        fetchShippingEstimate(resolvedAddress);
      }
      return;
    }

    setDeliveryAddress(resolvedAddress);
    setDeliveryAddressInput(formattedAddress);
    setShowDeliverySuggestions(false);
    setDeliverySuggestions([]);
    setDeliveryError('');
    setDeliveryGeoResult(null);
    handleInputChange('deliveryAddress', formattedAddress);
  };

  useEffect(() => {
    return () => {
      if (shippingAutocompleteTimeoutRef.current) {
        window.clearTimeout(shippingAutocompleteTimeoutRef.current);
      }
      if (deliveryAutocompleteTimeoutRef.current) {
        window.clearTimeout(deliveryAutocompleteTimeoutRef.current);
      }
    };
  }, []);

  const calculateDeliveryFee = async () => {
    let normalizedAddress = normalizeAddress(deliveryAddress);
    let fullAddress = deliveryAddressInput.trim() || formatDeliveryAddress(normalizedAddress);

    if (!hasCompleteShippingAddress(normalizedAddress)) {
      const resolved = await resolveDeliveryAddressInput();
      if (!resolved) {
        setDeliveryError('Please enter a complete delivery address and select a valid match.');
        return;
      }

      normalizedAddress = resolved.normalizedAddress;
      fullAddress = resolved.formattedAddress;
    }

    setDeliveryAddress(normalizedAddress);

    if (!fullAddress || !tenant?.id) return;
    
    setGeocodingDelivery(true);
    setDeliveryError('');
    setDeliveryGeoResult(null);
    
    try {
      const { data, error } = await supabase!.functions.invoke('geocode-address', {
        body: {
          address: fullAddress,
          tenant_id: tenant.id,
          calculate_distance: true,
        },
      });
      
      if (error || !data) {
        const details = error ? await getGeocodeErrorMessage(error) : 'Could not verify address. Please check and try again.';
        if (details.includes('Tenant has not configured a delivery origin address')) {
          setDeliveryError('Delivery is not configured by this store yet. Please contact the farm to enable delivery.');
        } else if (details.includes('Tenant delivery settings not found')) {
          setDeliveryError('Delivery is not available for this store yet. Please choose pickup or contact the farm.');
        } else {
          setDeliveryError(details);
        }
        return;
      }
      
      if (!data.matched_zone) {
        setDeliveryError(`Sorry, your address is ${data.distance_miles} miles away \u2014 outside our delivery area.`);
        setDeliveryGeoResult(data);
        return;
      }
      
      setDeliveryGeoResult(data);
      const formattedAddress = data.formatted_address || fullAddress;
      setDeliveryAddressInput(formattedAddress);
      handleInputChange('deliveryAddress', formattedAddress);
    } catch (err) {
      console.error('Delivery geocode error:', err);
      setDeliveryError('Failed to calculate delivery fee. Please try again.');
    } finally {
      setGeocodingDelivery(false);
    }
  };

  // Helper to get the delivery charge in cents
  const deliveryChargeCents = formData.deliveryMethod === 'delivery' && deliveryGeoResult?.matched_zone
    ? deliveryGeoResult.matched_zone.charge_cents
    : 0;

  const fetchShippingEstimate = async (address: ShippingAddress) => {
    if (!tenant?.id || !hasCompleteShippingAddress(address)) {
      setShippingEstimate(null);
      return;
    }

    setEstimateLoading(true);
    setEstimateError(null);

    try {
      // Estimate cart weight from items
      const cartWeightLbs = cartItems.reduce((sum, item) => {
        const weight = (item as any).weight ?? (item as any).binWeight ?? (item as any).requestedWeightLbs ?? 0;
        const qty = item.quantity ?? 1;
        return sum + (weight * qty);
      }, 0) || 10; // fallback 10 lbs if no weight data

      const { data, error } = await supabase.functions.invoke('estimate-shipping', {
        body: {
          tenant_id: tenant.id,
          dest_street: address.street,
          dest_city: address.city,
          dest_state: address.state,
          dest_zip: address.zip,
          cart_weight_lbs: cartWeightLbs,
          product_weights: cartItems.map((item: any) => ({
            product_id: item.productId,
            weight_lbs: Number(item.weight ?? item.binWeight ?? item.requestedWeightLbs ?? 0),
            qty: item.quantity ?? 1,
          })),
        },
      });

      if (error) throw error;

      if (data?.available === false) {
        setShippingEstimate(null);
        setEstimateError(data.message || 'Shipping will be confirmed after order.');
        return;
      }

      setShippingEstimate({
        estimate_cents: data.estimate_cents,
        range_low_cents: data.range_low_cents,
        range_high_cents: data.range_high_cents,
        service_label: data.service_label,
        transit_days: data.transit_days,
        num_packages: data.num_packages,
        packages: data.packages,
        breakdown: data.breakdown,
      });
    } catch (err: any) {
      console.error('[estimate-shipping]', err);
      setEstimateError('Could not estimate shipping. Cost will be confirmed after order.');
      setShippingEstimate(null);
    } finally {
      setEstimateLoading(false);
    }
  };

  const handleStripeCheckout = async () => {
    if (!tenant || !storefrontData?.products) return;
    if (!cardPaymentAvailable) {
      setOrderError('Card payments are not available for this store.');
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
          // Pre-packaged bins: for lb multiply by weight; for EA variants use unit price
          const isEach = (product?.unit || '').toLowerCase() === 'ea' || Boolean((product as any)?.variantSize || (product as any)?.variantUnit);
          unitPriceInCents = isEach
            ? Math.round(item.unitPriceCents)
            : Math.round(item.binWeight * item.unitPriceCents);
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

      // Add shipping charge if applicable — use the ceiling estimate (includes markup + materials + buffer)
      // to protect margin against rate fluctuation between estimate and label purchase
      const shippingChargeCents = formData.deliveryMethod === 'shipping'
        ? (shippingEstimate?.range_high_cents ?? shippingEstimate?.estimate_cents ?? (storefrontData?.settings as any)?.shipping_charge_cents ?? 0)
        : 0;
      
      if (shippingChargeCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Est. Shipping',
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

      // Add delivery charge if applicable
      if (deliveryChargeCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Delivery Fee',
              description: deliveryGeoResult?.matched_zone?.label ? `${deliveryGeoResult.matched_zone.label} zone` : undefined,
              metadata: { product_id: 'delivery', binWeight: undefined, weight: undefined, unit: 'ea' },
            },
            unit_amount: deliveryChargeCents,
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
        ? {
            ...formData,
            deliveryAddress: formatShippingAddress(shippingAddress),
            customerZip: shippingAddress.zip,
            customerStreet: shippingAddress.street,
            customerCity: shippingAddress.city,
            customerState: shippingAddress.state,
          }
        : formData.deliveryMethod === 'delivery'
        ? {
            ...formData,
            deliveryAddress: formatDeliveryAddress(deliveryAddress),
            requestedDeliveryDate: formData.requestedDeliveryDate || undefined,
          }
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
            requested_delivery_date: formData.requestedDeliveryDate || '',
            fulfillment_location: formData.fulfillmentLocation || '',
            discount_cents: discountCents,
            discount_code: appliedDiscount?.code || '',
            shipping_cents: shippingChargeCents,
            shipping_estimate_high_cents: shippingEstimate?.range_high_cents ?? shippingChargeCents,
            delivery_cents: deliveryChargeCents,
            delivery_zone: deliveryGeoResult?.matched_zone?.label || '',
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
        setOrderError(friendlyOrderError(`Checkout failed: ${data.error}`));
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
      setOrderError('Failed to start checkout. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenant || !storefrontData?.products) {
      setOrderError('Unable to process order. Please try again.');
      return;
    }

    // Validate required fields
    if (!formData.customerName || !formData.customerEmail || !formData.customerPhone) {
      setOrderError('Please fill in all required fields.');
      return;
    }

    if (!formData.paymentMethod) {
      setOrderError('Please select a payment method.');
      return;
    }

    let effectiveShippingAddress = shippingAddress;
    let effectiveDeliveryAddress = deliveryAddress;

    if (formData.deliveryMethod === 'delivery') {
      if (!formData.requestedDeliveryDate) {
        setOrderError('Please select a delivery date.');
        return;
      }
      if (!deliveryDateSchedulingEnabled && formData.requestedDeliveryDate < minimumDeliveryDateIso) {
        setOrderError(`Please choose a delivery date on or after ${minimumDeliveryDateIso}.`);
        return;
      }
      if (!hasCompleteShippingAddress(effectiveDeliveryAddress)) {
        const resolvedDelivery = await resolveDeliveryAddressInput();
        if (!resolvedDelivery) {
          setOrderError('Please provide a valid delivery address.');
          return;
        }
        effectiveDeliveryAddress = resolvedDelivery.normalizedAddress;
      }
      if (!deliveryGeoResult?.matched_zone) {
        setOrderError('Please calculate the delivery fee before placing your order.');
        return;
      }
    }

    if (formData.deliveryMethod === 'shipping') {
      if (!hasCompleteShippingAddress(effectiveShippingAddress)) {
        const resolvedShipping = await resolveShippingAddressInput();
        if (!resolvedShipping) {
          setOrderError('Please provide a valid shipping address.');
          return;
        }
        effectiveShippingAddress = resolvedShipping.normalizedAddress;
      }
      const formattedAddress = formatShippingAddress(effectiveShippingAddress);
      if (!formattedAddress) {
        setOrderError('Please provide a full shipping address.');
        return;
      }
    }

    // Preflight: ensure cart items are still in stock; prune and notify if not
    const availabilityOk = await verifyAndPruneCart();
    if (!availabilityOk) {
      return;
    }

    // Tokenize card details before creating the order (if paying by card now)
    let paymentMethodId: string | undefined;
    const isPayingByCardNow = formData.paymentMethod === 'card' &&
      (storefrontPaymentPolicy === 'pay_now' || formData.paymentNowChoice === 'pay_now');

    if (isPayingByCardNow) {
      if (!stripeCardRef.current) {
        setOrderError('Card form not ready. Please wait a moment and try again.');
        return;
      }
      try {
        paymentMethodId = await stripeCardRef.current.getPaymentMethodId();
      } catch (tokenErr: any) {
        setOrderError(tokenErr.message || 'Failed to process card details. Please try again.');
        return;
      }
    }

    // Save customer profile with email preference
    await saveCustomerProfile();

    const orderValue = checkoutDisplayTotalCents / 100;

    if (formData.paymentMethod === 'card' && !cardPaymentAvailable) {
      setOrderError('Card payments are not available for this store. Please choose another method.');
      return;
    }

    if (hasDepositProductInCart) {
      const isPayingDepositNow = (formData.paymentMethod === 'card' &&
        (storefrontPaymentPolicy !== 'both' || formData.paymentNowChoice === 'pay_now')) ||
        formData.paymentMethod === 'venmo' ||
        formData.paymentMethod === 'zelle';

      if (!isPayingDepositNow) {
        setOrderError('Deposit products must be paid at checkout by card, Venmo, or Zelle. Pay later is not available for these items.');
        return;
      }
    }

    // Build subscription payload
    console.log('🔍 Checking cart for subscription items:', cart.items);
    const subscriptionItem = cart.items.find((item: any) => item.metadata?.isSubscription);
    console.log('🔍 Found subscription item:', subscriptionItem);

    let subscriptionPayload = undefined;

    if (enableSubscription) {
      if (!selectedSubscriptionProductId) {
        setOrderError('Please choose a subscription box.');
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

    const shippingChargeCents = checkoutShippingChargeCents;

    const deliveryAddr = formData.deliveryMethod === 'delivery'
      ? formatDeliveryAddress(effectiveDeliveryAddress)
      : formData.deliveryMethod === 'shipping'
      ? formatShippingAddress(effectiveShippingAddress)
      : formData.deliveryAddress;

    console.log('📦 [ORDER] Starting order creation with parameters:', {
      tenantId: tenant.id,
      cartItemCount: cart.items.length,
      cartTotal: cart.total,
      deliveryMethod: formData.deliveryMethod,
      paymentMethod: formData.paymentMethod,
      deliveryAddress: deliveryAddr,
      subscriptionPayload,
      discountCents,
      shippingChargeCents,
      deliveryChargeCents,
      taxRate: tenant?.tax_rate,
      taxIncluded: tenant?.tax_included,
      chargeTaxOnOnline: tenant?.charge_tax_on_online
    });

    const result = await createOrder(
  tenant.id,
  cart,
  storefrontData.products,
  {
    ...formData,
    deliveryAddress: deliveryAddr,
    requestedDeliveryDate: formData.deliveryMethod === 'delivery' ? (formData.requestedDeliveryDate || undefined) : undefined,
    customerZip: formData.deliveryMethod === 'shipping' ? effectiveShippingAddress.zip : undefined,
    customerStreet: formData.deliveryMethod === 'shipping' ? effectiveShippingAddress.street : undefined,
    customerCity: formData.deliveryMethod === 'shipping' ? effectiveShippingAddress.city : undefined,
    customerState: formData.deliveryMethod === 'shipping' ? effectiveShippingAddress.state : undefined,
    subscription: subscriptionPayload,
    discountCents,
    shippingChargeCents: formData.deliveryMethod === 'shipping' ? shippingChargeCents : 0,
    shippingEstimateHighCents: formData.deliveryMethod === 'shipping' ? (shippingEstimate?.range_high_cents ?? shippingChargeCents) : 0,
    deliveryChargeCents: formData.deliveryMethod === 'delivery' ? deliveryChargeCents : 0,
    paymentMethodId,
  },
  {
    taxRate: tenant?.tax_rate ?? 0,
    taxIncluded: !!tenant?.tax_included,
    chargeTaxOnOnline: tenant?.charge_tax_on_online ?? true,
  }
);

    console.log('📦 [ORDER] Result received:', {
      success: result.success,
      orderId: result.orderId,
      error: result.error,
      fullResult: result
    });

    if (result.success) {
      console.log('✅ [ORDER] Order created successfully:', result.orderId);
      setOrderError(null);
      setOrderId(result.orderId);

      if (result.needsStripeConfirmation) {
        if (!stripePromise || !result.clientSecret) {
          setOrderError('Stripe is not configured for this store. Please contact support.');
          return;
        }

        setStripeClientSecret(result.clientSecret || null);
        setNeedsStripeConfirmation(true);
        return;
      }

      setOrderSuccess(true);
      try {
        trackPurchase({ orderId: result.orderId!, tenantId: tenant.id, value: orderValue, currency: 'USD', itemsCount: cart.items.length });
      } catch {}
      clearCart();
    } else {
      const errorMessage = result.error || 'Failed to create order. Please try again.';
      console.error('❌ [ORDER] Order creation failed:', {
        errorMessage,
        rawError: result.error,
        fullResult: result
      });
      setOrderError(friendlyOrderError(errorMessage));

      if (isInventoryOrderError(errorMessage)) {
        toast.error('Some items in your cart are sold out. Please update your cart and try again.', {
          duration: 6000,
        });
      }
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
  const storefrontPaymentPolicy = (storefrontData?.settings as any)?.storefront_payment_policy ?? 'pay_now';
  const payLaterAllowed = payLaterOptions.length > 0 && !hasDepositProductInCart;
  const payAtPickupAllowed = storefrontPaymentPolicy === 'both' && !hasDepositProductInCart;
  const firstExternalPaymentMethod = externalPaymentOptions[0]?.method;
  const selectedExternalPayment = externalPaymentOptions.find(option => option.method === formData.paymentMethod);

  useEffect(() => {
    if (!cardPaymentAvailable && formData.paymentMethod === 'card') {
      setFormData(prev => ({ ...prev, paymentMethod: (firstExternalPaymentMethod ?? (payLaterAllowed ? 'pay_later' : '')) as any }));
    }
  }, [cardPaymentAvailable, firstExternalPaymentMethod, formData.paymentMethod, payLaterAllowed]);

  useEffect(() => {
    if (hasDepositProductInCart && ['pay_later', 'cash', 'cashapp'].includes(formData.paymentMethod as any)) {
      setFormData(prev => ({ ...prev, paymentMethod: (cardPaymentAvailable ? 'card' : firstExternalPaymentMethod ?? '') as any }));
    }
  }, [cardPaymentAvailable, firstExternalPaymentMethod, formData.paymentMethod, hasDepositProductInCart]);

  useEffect(() => {
    if (formData.paymentMethod === 'card') {
      if (hasDepositProductInCart) {
        setFormData(prev => ({
          ...prev,
          paymentNowChoice: 'pay_now',
        }));
      } else if (storefrontPaymentPolicy === 'both') {
        setFormData(prev => ({
          ...prev,
          paymentNowChoice: prev.paymentNowChoice ?? 'pay_now',
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          paymentNowChoice: storefrontPaymentPolicy as 'pay_now' | 'pay_at_pickup',
        }));
      }
    } else {
      setFormData(prev => ({ ...prev, paymentNowChoice: undefined }));
    }
  }, [formData.paymentMethod, hasDepositProductInCart, storefrontPaymentPolicy]);

  useEffect(() => {
    if (orderError || checkoutError) {
      setDismissedCheckoutError(false);
    }
  }, [orderError, checkoutError]);

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

  const checkoutFailureMessage = orderError || (dismissedCheckoutError ? null : checkoutError);

  if (needsStripeConfirmation && stripeClientSecret && orderId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Complete Payment</h1>
          <p className="text-gray-600 mb-6">
            Enter your card details to complete your order.
          </p>
          {stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret }}>
              <StripeAuthorizationForm
                orderId={orderId}
                onAuthorized={() => {
                  setNeedsStripeConfirmation(false);
                  setOrderSuccess(true);
                  try {
                    trackPurchase({ orderId, tenantId: tenant?.id, value: cart.total, currency: 'USD', itemsCount: cart.items.length });
                  } catch {}
                  clearCart();
                }}
                onError={(message) => {
                  setOrderError(message || 'Payment authorization failed');
                }}
              />
            </Elements>
          ) : (
            <div className="text-red-600">Stripe is not configured.</div>
          )}
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
    const requestedWeightLbs = (item as any).requestedWeightLbs;
    const binWeight = (item as any).binWeight;
    const unitPriceCents = (item as any).unitPriceCents;
    const metaPrice: number | undefined = (item as any).metadata?.subscriptionTotalPrice;
    const quantity = item.quantity;
    
    let itemTotal = 0;
    
    if (binWeight && unitPriceCents) {
      const isEach = (item.product.unit || '').toLowerCase() === 'ea' || Boolean((item.product as any).variantSize || (item.product as any).variantUnit);
      itemTotal = (isEach ? (unitPriceCents / 100) : (binWeight * (unitPriceCents / 100))) * quantity;
    } else if (requestedWeightLbs && requestedWeightLbs > 0) {
      itemTotal = item.product.pricePer * requestedWeightLbs * quantity;
    } else if (weight && weight > 0) {
      itemTotal = item.product.pricePer * weight * quantity;
    } else if (metaPrice && metaPrice > 0) {
      itemTotal = metaPrice * quantity;
    } else {
      itemTotal = item.product.pricePer * quantity;
    }
    
    return sum + itemTotal;
  }, 0);

  const onlinePaymentFeeSettings = storefrontData?.settings.onlinePaymentFeeSettings;
  const checkoutShippingChargeCents = formData.deliveryMethod === 'shipping'
    ? (shippingEstimate?.range_high_cents
        ?? shippingEstimate?.estimate_cents
        ?? (storefrontData?.settings as any)?.shipping_charge_cents
        ?? 0)
    : 0;
  const checkoutDeliveryChargeCents = formData.deliveryMethod === 'delivery' && deliveryGeoResult?.matched_zone
    ? deliveryGeoResult.matched_zone.charge_cents
    : 0;
  const checkoutSubtotalAfterDiscountCents = Math.max(0, Math.round(cartTotal * 100) - discountCents);
  const checkoutTaxCents = tenant?.charge_tax_on_online === false || tenant?.tax_included
    ? 0
    : Math.round(checkoutSubtotalAfterDiscountCents * (tenant?.tax_rate ?? 0));
  const checkoutBaseTotalCents = checkoutSubtotalAfterDiscountCents + checkoutTaxCents + checkoutShippingChargeCents + checkoutDeliveryChargeCents;
  const checkoutOnlinePaymentFeeCents = getOnlinePaymentFeeCents({
    paymentMethod: formData.paymentMethod,
    paymentNowChoice: formData.paymentNowChoice,
    baseTotalCents: checkoutBaseTotalCents,
    settings: onlinePaymentFeeSettings,
  });
  const checkoutDisplayTotalCents = addOnlinePaymentFee(checkoutBaseTotalCents, checkoutOnlinePaymentFeeCents);

  const shippingEstimateDebug = formData.deliveryMethod === 'shipping' ? {
    request: {
      tenant_id: tenant?.id ?? null,
      dest_street: shippingAddress.street || null,
      dest_city: shippingAddress.city || null,
      dest_state: shippingAddress.state || null,
      dest_zip: shippingAddress.zip || null,
      cart_weight_lbs: cartItems.reduce((sum, item: any) => {
        const weight = item.weight ?? item.binWeight ?? item.requestedWeightLbs ?? 0;
        const qty = item.quantity ?? 1;
        return sum + (weight * qty);
      }, 0) || 10,
      product_weights: cartItems.map((item: any) => ({
        product_id: item.productId,
        weight_lbs: Number(item.weight ?? item.binWeight ?? item.requestedWeightLbs ?? 0),
        qty: item.quantity ?? 1,
      })),
    },
    response: shippingEstimate,
    error: estimateError,
  } : null;

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

          {checkoutFailureMessage && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              <div className="font-semibold">Order not completed</div>
              <div className="text-sm">{friendlyOrderError(checkoutFailureMessage)}</div>
              <button
                type="button"
                onClick={() => {
                  setOrderError(null);
                  setDismissedCheckoutError(true);
                }}
                className="mt-3 text-sm font-medium text-red-700 hover:text-red-800"
              >
                Dismiss
              </button>
            </div>
          )}
          
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
                        handleInputChange('requestedDeliveryDate', '');
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
                        handleInputChange('requestedDeliveryDate', '');
                        handleInputChange('fulfillmentLocation', '');
                        let prefilledShippingAddress: ShippingAddress | null = null;
                        if (isAddressBlank(shippingAddress)) {
                          const parsedShipping = parseSavedAddress(formData.deliveryAddress || '');
                          if (parsedShipping) {
                            const normalizedShipping = normalizeAddress(parsedShipping);
                            setShippingAddress(normalizedShipping);
                            setShippingAddressInput(formData.deliveryAddress || formatShippingAddress(normalizedShipping));
                            prefilledShippingAddress = normalizedShipping;
                          } else if (hasCompleteShippingAddress(deliveryAddress)) {
                            const normalizedDeliveryAddress = normalizeAddress(deliveryAddress);
                            setShippingAddress(normalizedDeliveryAddress);
                            setShippingAddressInput(formatShippingAddress(normalizedDeliveryAddress));
                            prefilledShippingAddress = normalizedDeliveryAddress;
                          }
                        } else {
                          const normalizedShipping = normalizeAddress(shippingAddress);
                          setShippingAddressInput(formatShippingAddress(normalizedShipping) || shippingAddressInput);
                          if (hasCompleteShippingAddress(normalizedShipping)) {
                            prefilledShippingAddress = normalizedShipping;
                          }
                        }

                        if (prefilledShippingAddress && hasCompleteShippingAddress(prefilledShippingAddress)) {
                          void fetchShippingEstimate(prefilledShippingAddress);
                        }
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
                          {formData.deliveryMethod === 'shipping' && shippingEstimate?.estimate_cents
                            ? `$${(shippingEstimate.range_high_cents / 100).toFixed(2)}`
                            : 'Enter ZIP for estimate'}
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Show Other if enabled */}
                  {(storefrontData?.settings as any)?.allow_other && (
                    <button
                      type="button"
                      onClick={() => {
                        handleInputChange('deliveryMethod', 'other');
                        handleInputChange('requestedDeliveryDate', '');
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

                  {/* Show Delivery if enabled */}
                  {(storefrontData?.settings as any)?.allow_delivery && (
                    <button
                      type="button"
                      onClick={() => {
                        handleInputChange('deliveryMethod', 'delivery');
                        handleInputChange('fulfillmentLocation', '');
                        if (deliveryDateSchedulingEnabled && !formData.requestedDeliveryDate) {
                          const firstAvailableDate = deliveryDateOptions.find((option) => option.is_available)?.delivery_date;
                          if (firstAvailableDate) {
                            handleInputChange('requestedDeliveryDate', firstAvailableDate);
                          }
                        }
                        if (isAddressBlank(deliveryAddress)) {
                          const parsedDelivery = parseSavedAddress(formData.deliveryAddress || '');
                          if (parsedDelivery) {
                            setDeliveryAddress(parsedDelivery);
                            setDeliveryAddressInput(formData.deliveryAddress || formatDeliveryAddress(parsedDelivery));
                          } else if (hasCompleteShippingAddress(shippingAddress)) {
                            const normalizedShippingAddress = normalizeAddress(shippingAddress);
                            setDeliveryAddress(normalizedShippingAddress);
                            setDeliveryAddressInput(formatDeliveryAddress(normalizedShippingAddress));
                          }
                        } else {
                          setDeliveryAddressInput(formatDeliveryAddress(normalizeAddress(deliveryAddress)) || deliveryAddressInput);
                        }
                        setDeliveryGeoResult(null);
                        setDeliveryError('');
                      }}
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
                        <div className="text-3xl mb-2">🚗</div>
                        <div className="font-semibold text-gray-800">Delivery</div>
                        <div className="text-sm font-medium mt-1" style={{ color: primaryColor }}>
                          {(() => {
                            const zones = (storefrontData?.settings as any)?.delivery_zones || [];
                            const enabled = zones.filter((z: any) => z.enabled);
                            if (enabled.length === 0) return 'Available';
                            const min = Math.min(...enabled.map((z: any) => z.charge_cents));
                            return `From $${(min / 100).toFixed(2)}`;
                          })()}
                        </div>
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

                {/* Shipping Address Input */}
                {formData.deliveryMethod === 'shipping' && (
                  <div className="mt-4 space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Shipping Address *
                    </label>
                    <p className="text-xs text-gray-500 -mt-2">
                      Start typing your full address and select a match.
                    </p>

                    <div className="relative">
                      <input
                        type="text"
                        name="shippingAddress"
                        autoComplete="shipping street-address"
                        required
                        value={shippingAddressInput}
                        onChange={(e) => handleShippingAddressInputChange(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = primaryColor;
                          setShowShippingSuggestions(true);
                          scheduleAddressSuggestions('shipping', { street: shippingAddressInput, city: '', state: '', zip: '' });
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = '';
                          window.setTimeout(() => {
                            setShowShippingSuggestions(false);
                            void resolveShippingAddressInput();
                          }, 120);
                        }}
                        placeholder="Street, City, State ZIP"
                      />
                      {estimateLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="h-4 w-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {showShippingSuggestions && (loadingShippingSuggestions || shippingSuggestions.length > 0) && (
                        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-auto">
                          {loadingShippingSuggestions ? (
                            <div className="px-3 py-2 text-sm text-gray-500">Searching addresses...</div>
                          ) : (
                            shippingSuggestions.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  applySuggestedAddress('shipping', suggestion);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                {suggestion}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Shipping estimate banner — appears once ZIP is valid */}
                    {estimateLoading && (
                      <div className="flex items-center gap-2 rounded-lg px-4 py-3 bg-gray-50 border border-gray-200 text-sm text-gray-500">
                        <div className="h-3 w-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        Calculating shipping estimate...
                      </div>
                    )}

                    {!estimateLoading && shippingEstimate && shippingEstimate.estimate_cents !== null && (
                      <div
                        className="rounded-lg px-4 py-3 text-sm"
                        style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}30`, borderWidth: '1px' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold" style={{ color: primaryColor }}>
                              📦 Shipping:{' '}
                              <span className="text-gray-800">
                                ${(shippingEstimate.range_high_cents / 100).toFixed(2)}
                              </span>
                            </p>
                            {(shippingEstimate.num_packages ?? 1) > 1 ? (
                              <>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Ships in {shippingEstimate.num_packages} packages · ~{shippingEstimate.transit_days} business days
                                </p>
                                {shippingEstimate.packages?.map((pkg, i) => (
                                  <p key={i} className="text-[10px] text-gray-500 mt-0.5">
                                    {pkg.package_type === 'cold' ? '❄️ Frozen/chilled items' : '📦 Standard items'} — {pkg.service} (~{pkg.transit_days} days)
                                  </p>
                                ))}
                              </>
                            ) : (
                              <p className="text-xs text-gray-500 mt-0.5">
                                {shippingEstimate.service_label} · ~{shippingEstimate.transit_days} business days in transit
                              </p>
                            )}
                            {shippingEstimate.breakdown?.dry_ice_cost_cents > 0 && (
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                Includes carrier fee, insulated packaging, and dry ice to keep your frozen items safe in transit.
                              </p>
                            )}
                            {shippingEstimate.breakdown?.has_ambient && !shippingEstimate.breakdown?.has_cold && (
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                Includes carrier fee and standard packaging.
                              </p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              Includes carrier fee, packaging, and handling. Final charge confirmed at fulfillment.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {isDev && formData.deliveryMethod === 'shipping' && shippingEstimateDebug && (
                      <details className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                        <summary className="cursor-pointer font-semibold text-slate-800">
                          Dev: estimate-shipping debug
                        </summary>
                        <div className="mt-3 space-y-3">
                          <div>
                            <div className="font-semibold mb-1">Request</div>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-white p-2 border border-slate-200">{JSON.stringify(shippingEstimateDebug.request, null, 2)}</pre>
                          </div>
                          <div>
                            <div className="font-semibold mb-1">Response</div>
                            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-white p-2 border border-slate-200">{JSON.stringify(shippingEstimateDebug.response, null, 2)}</pre>
                          </div>
                        </div>
                      </details>
                    )}

                    {!estimateLoading && shippingEstimate?.reason === 'no_origin_zip' && (
                      <div className="rounded-lg px-4 py-3 bg-amber-50 border border-amber-200 text-sm text-amber-800">
                        📦 Shipping cost will be calculated and confirmed after your order is placed.
                      </div>
                    )}

                    {!estimateLoading && estimateError && (
                      <div className="rounded-lg px-4 py-3 bg-red-50 border border-red-200 text-sm text-red-700">
                        {estimateError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Delivery Address Input & Fee Calculator */}
              {formData.deliveryMethod === 'delivery' && (
                <div className="mt-4 space-y-4">
                  {(storefrontData?.settings as any)?.delivery_schedule_note && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-700">
                        \uD83D\uDCC5 {(storefrontData?.settings as any)?.delivery_schedule_note}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Select Delivery Date *
                    </label>

                    {deliveryDatesLoading ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                        Loading delivery dates...
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={openDeliveryDateModal}
                          disabled={calendarDeliveryDateOptions.length === 0}
                          className="w-full rounded-lg border-2 border-gray-200 px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                          onFocus={(e) => e.currentTarget.style.borderColor = primaryColor}
                          onBlur={(e) => e.currentTarget.style.borderColor = ''}
                        >
                          <span className="block text-sm font-medium text-gray-800">
                            {formData.requestedDeliveryDate
                              ? formatDeliveryDateLabel(formData.requestedDeliveryDate)
                              : 'Choose a delivery date'}
                          </span>
                          <span className="block text-xs text-gray-500 mt-0.5">
                            {calendarDeliveryDateOptions.length > 0
                              ? 'Tap to open calendar and pick an available date'
                              : 'No delivery dates are currently available'}
                          </span>
                        </button>
                      </div>
                    )}

                    {deliveryDatesError && deliveryDateSchedulingEnabled && (
                      <p className="text-sm text-red-600">{deliveryDatesError}</p>
                    )}

                    {showDeliveryDateModal && (
                      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
                        <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
                          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                            <h3 className="text-base font-semibold text-gray-900">Select Delivery Date</h3>
                            <button
                              type="button"
                              onClick={() => setShowDeliveryDateModal(false)}
                              className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            >
                              Close
                            </button>
                          </div>

                          <div className="space-y-3 px-4 py-4">
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => setDeliveryCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                disabled={!canGoPrevMonth}
                                className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Prev
                              </button>
                              <p className="text-sm font-semibold text-gray-800">
                                {deliveryCalendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                              </p>
                              <button
                                type="button"
                                onClick={() => setDeliveryCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                disabled={!canGoNextMonth}
                                className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Next
                              </button>
                            </div>

                            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-gray-500">
                              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName) => (
                                <div key={dayName} className="py-1">{dayName}</div>
                              ))}
                            </div>

                            <div className="grid grid-cols-7 gap-1">
                              {(() => {
                                const year = deliveryCalendarMonth.getFullYear();
                                const month = deliveryCalendarMonth.getMonth();
                                const firstDayOfMonth = new Date(year, month, 1);
                                const startOffset = firstDayOfMonth.getDay();
                                const daysInMonth = new Date(year, month + 1, 0).getDate();
                                const dayCells: React.ReactNode[] = [];

                                for (let i = 0; i < startOffset; i += 1) {
                                  dayCells.push(<div key={`empty-start-${i}`} className="h-10" />);
                                }

                                for (let day = 1; day <= daysInMonth; day += 1) {
                                  const date = new Date(year, month, day);
                                  const iso = toIsoDate(date);
                                  const option = availableDateMap.get(iso);
                                  const isAvailable = Boolean(option?.is_available);
                                  const isSelected = formData.requestedDeliveryDate === iso;

                                  dayCells.push(
                                    <button
                                      key={iso}
                                      type="button"
                                      disabled={!isAvailable}
                                      onClick={() => {
                                        handleInputChange('requestedDeliveryDate', iso);
                                        setShowDeliveryDateModal(false);
                                      }}
                                      className="h-10 rounded-md border text-sm transition-colors disabled:cursor-not-allowed"
                                      style={isSelected
                                        ? {
                                            borderColor: primaryColor,
                                            backgroundColor: `${primaryColor}20`,
                                            color: '#111827',
                                            fontWeight: 700,
                                          }
                                        : isAvailable
                                          ? {
                                              borderColor: '#86efac',
                                              backgroundColor: '#f0fdf4',
                                              color: '#166534',
                                            }
                                          : {
                                              borderColor: '#e5e7eb',
                                              backgroundColor: '#f9fafb',
                                              color: '#9ca3af',
                                            }}
                                      title={isAvailable && option
                                        ? `${formatDeliveryDateLabel(iso)} (${option.remaining_slots} slots left)`
                                        : `${formatDeliveryDateLabel(iso)} unavailable`}
                                    >
                                      {day}
                                    </button>
                                  );
                                }

                                return dayCells;
                              })()}
                            </div>

                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                              <p>
                                Green dates are available.
                                {formData.requestedDeliveryDate ? ` Selected: ${formatDeliveryDateLabel(formData.requestedDeliveryDate)}.` : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <label className="block text-sm font-medium text-gray-700">
                    Delivery Address *
                  </label>
                  <p className="text-xs text-gray-500 -mt-2">
                    Start typing your full address and select a match.
                  </p>
                  <div className="relative">
                    <input
                      type="text"
                      name="deliveryAddress"
                      autoComplete="shipping street-address"
                      required
                      value={deliveryAddressInput}
                      onChange={(e) => handleDeliveryAddressInputChange(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-current transition-colors"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = primaryColor;
                        setShowDeliverySuggestions(true);
                        scheduleAddressSuggestions('delivery', { street: deliveryAddressInput, city: '', state: '', zip: '' });
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = '';
                        window.setTimeout(() => {
                          setShowDeliverySuggestions(false);
                          void resolveDeliveryAddressInput();
                        }, 120);
                      }}
                      placeholder="Street, City, State ZIP"
                    />
                    {showDeliverySuggestions && (loadingDeliverySuggestions || deliverySuggestions.length > 0) && (
                      <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-64 overflow-auto">
                        {loadingDeliverySuggestions ? (
                          <div className="px-3 py-2 text-sm text-gray-500">Searching addresses...</div>
                        ) : (
                          deliverySuggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applySuggestedAddress('delivery', suggestion);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              {suggestion}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <button
                      type="button"
                      onClick={calculateDeliveryFee}
                      disabled={geocodingDelivery || !deliveryAddressInput.trim()}
                      className="w-full py-3 px-4 rounded-lg font-medium transition-all border-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ borderColor: primaryColor, color: primaryColor }}
                    >
                      {geocodingDelivery ? 'Calculating...' : 'Calculate Delivery Fee'}
                    </button>
                  </div>
                  
                  {deliveryGeoResult?.matched_zone && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-medium text-green-800">✓ {deliveryGeoResult.matched_zone.label} Zone</p>
                          <p className="text-xs text-green-600">{deliveryGeoResult.distance_miles} miles from store</p>
                        </div>
                        <p className="text-lg font-bold text-green-800">
                          ${(deliveryGeoResult.matched_zone.charge_cents / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {deliveryError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm text-red-700">{deliveryError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Method */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-6">Payment Method</h2>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {payLaterAllowed && (
                    <button
                      type="button"
                      onClick={() => handleInputChange('paymentMethod', 'pay_later')}
                      className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                        formData.paymentMethod === 'pay_later'
                          ? 'border-current shadow-lg'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={formData.paymentMethod === 'pay_later' ? {
                        borderColor: primaryColor,
                        boxShadow: `0 0 20px ${primaryColor}40`
                      } : {}}
                    >
                      <div className="text-center">
                        <div className="text-2xl mb-2">🕒</div>
                        <div className="font-medium text-gray-800">Pay Later</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {payLaterOptions.join(' • ')}
                        </div>
                      </div>
                    </button>
                  )}

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

                  {externalPaymentOptions.map((option) => (
                    <button
                      key={option.method}
                      type="button"
                      onClick={() => handleInputChange('paymentMethod', option.method)}
                      className={`p-4 rounded-lg border-2 transition-all duration-200 ${
                        formData.paymentMethod === option.method
                          ? 'border-current shadow-lg'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      style={formData.paymentMethod === option.method ? {
                        borderColor: primaryColor,
                        boxShadow: `0 0 20px ${primaryColor}40`
                      } : {}}
                    >
                      <div className="text-center">
                        <div className="font-medium text-gray-800">{option.label}</div>
                        <div className="text-xs text-gray-500 mt-1">Pay now</div>
                      </div>
                    </button>
                  ))}

                </div>

                {hasDepositProductInCart && (
                  <div className="rounded-md p-4 mb-4 border border-amber-300 bg-amber-50">
                    <p className="text-sm text-amber-800">
                      Deposit products require payment at checkout. The amount due today is the upfront deposit; remaining balance (if any) is collected later.
                    </p>
                  </div>
                )}

                {hasDepositProductInCart && !cardPaymentAvailable && externalPaymentOptions.length === 0 && (
                  <div className="rounded-md p-4 mb-4 border border-red-300 bg-red-50">
                    <p className="text-sm text-red-700">
                      This store does not currently have card, Venmo, or Zelle payments enabled, so deposit products cannot be checked out online until one of those payment methods is turned on.
                    </p>
                  </div>
                )}

                {formData.paymentMethod === 'card' && payAtPickupAllowed && (
                  <div className="rounded-md p-4 mb-4" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40`, borderWidth: '1px' }}>
                    <p className="text-sm font-medium text-gray-700 mb-3">When would you like to pay?</p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="paymentNowChoice"
                          value="pay_now"
                          checked={formData.paymentNowChoice === 'pay_now'}
                          onChange={() => handleInputChange('paymentNowChoice', 'pay_now')}
                          className="h-4 w-4"
                          style={{ accentColor: primaryColor }}
                        />
                        Pay now (authorize card; final charge adjusted after packing)
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="paymentNowChoice"
                          value="pay_at_pickup"
                          checked={formData.paymentNowChoice === 'pay_at_pickup'}
                          onChange={() => handleInputChange('paymentNowChoice', 'pay_at_pickup')}
                          className="h-4 w-4"
                          style={{ accentColor: primaryColor }}
                        />
                        Pay at pickup
                      </label>
                    </div>
                  </div>
                )}

                {formData.paymentMethod === 'card' && payAtPickupAllowed && formData.paymentNowChoice === 'pay_at_pickup' && (
                  <div className="rounded-md p-4 mb-4" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40`, borderWidth: '1px' }}>
                    <p className="text-sm" style={{ color: primaryColor }}>
                      {`You'll pay when you ${formData.deliveryMethod === 'pickup' ? 'pick up' : 'receive'} your order.`}
                    </p>
                  </div>
                )}

                {selectedExternalPayment && (
                  <div className="rounded-md p-4 mb-4 border border-amber-300 bg-amber-50">
                    <p className="text-sm font-semibold text-amber-900 mb-2">
                      Pay with {selectedExternalPayment.label}
                    </p>
                    <p className="text-sm text-amber-800 mb-3">
                      Send payment now, then place your order. The store will verify the payment before marking the order paid.
                    </p>
                    {selectedExternalPayment.qrUrl && (
                      <img
                        src={selectedExternalPayment.qrUrl}
                        alt={`${selectedExternalPayment.label} QR code`}
                        className="mb-3 h-40 w-40 rounded-lg border border-amber-200 bg-white object-contain p-2"
                      />
                    )}
                    {selectedExternalPayment.detail && (
                      <div className="rounded-lg bg-white/80 border border-amber-200 p-3 text-sm text-gray-800 whitespace-pre-line">
                        <span className="font-semibold">{selectedExternalPayment.detailLabel}: </span>
                        {selectedExternalPayment.detail}
                      </div>
                    )}
                    {!selectedExternalPayment.qrUrl && !selectedExternalPayment.detail && (
                      <p className="text-sm text-amber-800">
                        This store accepts {selectedExternalPayment.label}, but has not added QR or account details. Please contact the store for payment instructions.
                      </p>
                    )}
                  </div>
                )}

                {formData.paymentMethod && formData.paymentMethod !== 'card' && !selectedExternalPayment && (
                  <div className="rounded-md p-4" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40`, borderWidth: '1px' }}>
                    <p className="text-sm" style={{ color: primaryColor}}>
                      You'll pay when you {formData.deliveryMethod === 'pickup' ? 'pick up' : 'receive'} your order.
                    </p>
                  </div>
                )}

                {formData.paymentMethod === 'card' && storefrontPaymentPolicy === 'pay_at_pickup' && (
                  <div className="rounded-md p-4" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}40`, borderWidth: '1px' }}>
                    <p className="text-sm" style={{ color: primaryColor }}>
                      {`You'll pay when you ${formData.deliveryMethod === 'pickup' ? 'pick up' : 'receive'} your order.`}
                    </p>
                  </div>
                )}

                {/* Inline Stripe card form — shown when card is selected and payment is due now */}
                {formData.paymentMethod === 'card' && stripePromise &&
                  (storefrontPaymentPolicy === 'pay_now' || formData.paymentNowChoice === 'pay_now') && (
                  <div className="mt-4 p-4 border-2 rounded-lg" style={{ borderColor: `${primaryColor}40` }}>
                    <p className="text-sm font-medium text-gray-700 mb-3">Card Details</p>
                    <Elements stripe={stripePromise}>
                      <StripeInlineCardForm ref={stripeCardRef} />
                    </Elements>
                  </div>
                )}

                {formData.paymentMethod === 'card' && !stripePromise && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">Card payments are not configured for this store. Please choose another payment method.</p>
                  </div>
                )}

                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes/Instructions
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
                    const requestedWeightLbs = (item as any).requestedWeightLbs;
                    const lineType = (item as any).lineType;
                    const binWeight = (item as any).binWeight;
                    const unitPriceCents = (item as any).unitPriceCents;
                    const metaPrice = item.metadata?.subscriptionTotalPrice;
                    
                    let displayText = '';
                    let itemTotal = 0;
                    
                    if (binWeight && unitPriceCents) {
                      // Pre-packaged bin (lb or EA variant)
                      const isEach = (item.product.unit || '').toLowerCase() === 'ea' || Boolean((item.product as any).variantSize || (item.product as any).variantUnit);
                      const variantUnit = (item.product as any).variantUnit || item.product.unit;
                      displayText = isEach
                        ? `${binWeight} ${variantUnit} @ $${(unitPriceCents / 100).toFixed(2)}`
                        : `${binWeight} ${item.product.unit} package @ $${(unitPriceCents / 100).toFixed(2)}/${item.product.unit}`;
                      itemTotal = (isEach ? (unitPriceCents / 100) : (binWeight * (unitPriceCents / 100))) * item.quantity;
                    } else if (lineType === 'pack_for_you' && requestedWeightLbs && requestedWeightLbs > 0) {
                      // Pack-for-you estimated weight
                      displayText = `${requestedWeightLbs} ${item.product.unit} requested @ $${item.product.pricePer.toFixed(2)}/${item.product.unit}`;
                      itemTotal = item.product.pricePer * requestedWeightLbs * item.quantity;
                    } else if (weight && weight > 0) {
                      // Weight-based
                      displayText = `${weight} ${item.product.unit} @ $${item.product.pricePer.toFixed(2)}/${item.product.unit}`;
                      itemTotal = item.product.pricePer * weight * item.quantity;
                    } else if (metaPrice && metaPrice > 0) {
                      displayText = `${item.product.name} (${(item.product as any).subscriptionInterval || 'subscription'})`;
                      itemTotal = metaPrice * item.quantity;
                    } else {
                      // Fixed price
                      displayText = `${item.quantity} × $${item.product.pricePer.toFixed(2)}`;
                      itemTotal = item.product.pricePer * item.quantity;
                    }
                    
                    return (
                      <div key={`${item.productId}-${binWeight ?? weight ?? requestedWeightLbs ?? lineType ?? 'std'}`} className="flex justify-between items-center py-2 border-b">
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
                    {formData.deliveryMethod === 'shipping' && (
                      <div className="flex justify-between text-gray-600">
                        <span>Est. Shipping:</span>
                        <span>
                          {estimateLoading
                            ? <span className="text-gray-400 text-xs">Calculating...</span>
                            : shippingEstimate?.estimate_cents
                            ? `$${(shippingEstimate.range_high_cents / 100).toFixed(2)}`
                            : shippingAddressInput.trim().length < 5
                            ? <span className="text-gray-400 text-xs">Enter address above</span>
                            : <span className="text-gray-400 text-xs">Calculated at fulfillment</span>
                          }
                        </span>
                      </div>
                    )}
                    {formData.deliveryMethod === 'delivery' && deliveryGeoResult?.matched_zone && (
                      <div className="flex justify-between text-gray-600">
                        <span>Delivery ({deliveryGeoResult.matched_zone.label}):</span>
                        <span>${(deliveryGeoResult.matched_zone.charge_cents / 100).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-gray-600">
                      <span>Tax:</span>
                      <span>
                        {tenant?.charge_tax_on_online === false
                          ? '$0.00'
                          : tenant?.tax_included
                          ? 'Included in price'
                          : `$${(checkoutTaxCents / 100).toFixed(2)}`}
                      </span>
                    </div>

                    {checkoutOnlinePaymentFeeCents > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>{ONLINE_PAYMENT_FEE_LABEL}:</span>
                        <span>${(checkoutOnlinePaymentFeeCents / 100).toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-lg font-bold text-gray-800 border-t pt-2">
                      <span>Total:</span>
                      <span>${(checkoutDisplayTotalCents / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Your cart is empty</p>
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

              {checkoutOnlinePaymentFeeCents > 0 && (
                <p className="text-xs text-gray-500 mt-3 text-center">
                  {ONLINE_PAYMENT_FEE_LABEL} applies to orders paid online by card.
                </p>
              )}

              {formData.paymentMethod !== 'card' && cartItems.length > 0 && (
                <p className="text-xs text-gray-500 mt-3 text-center">
                  You'll receive an order confirmation email. Payment due at {formData.deliveryMethod === 'pickup' ? 'pickup' : 'delivery'}.
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
      
      {/* Cart Validation Modal */}
      {showCartValidationModal && (
        <CartValidationModal
          removedItems={removedItemsData}
          primaryColor={primaryColor}
          onConfirm={(itemsToPreOrder) => {
            // Re-add selected items as pre-orders
            itemsToPreOrder.forEach((productId) => {
              const removedItem = removedItemsData.find(item => item.productId === productId);
              if (removedItem) {
                const storefrontProduct = storefrontData?.products?.find((p: any) => p.id === productId);
                if (storefrontProduct) {
                  // Find the original cart item to get the correct quantity
                  const originalCartItem = cart.items.find((i: any) => 
                    i.productId === productId &&
                    i.binWeight === removedItem.binWeight &&
                    i.weight === removedItem.weight &&
                    i.requestedWeightLbs === removedItem.requestedWeightLbs &&
                    i.lineType === removedItem.lineType
                  );
                  
                  const quantity = (originalCartItem as any)?.quantity ?? 1;
                  
                  // Re-add to cart with pre-order flag
                  if (removedItem.binWeight) {
                    addToCart(productId, quantity, {
                      binWeight: removedItem.binWeight,
                      unitPriceCents: storefrontProduct.pricePer * 100, // Convert to cents
                      isPreOrder: true,
                    });
                  } else if (removedItem.weight) {
                    addToCart(productId, quantity, {
                      weight: removedItem.weight,
                      isPreOrder: true,
                    });
                  } else if (removedItem.lineType === 'pack_for_you' && removedItem.requestedWeightLbs) {
                    addToCart(productId, quantity, {
                      requestedWeightLbs: removedItem.requestedWeightLbs,
                      lineType: 'pack_for_you',
                      isPreOrder: true,
                    });
                  } else {
                    addToCart(productId, quantity, { isPreOrder: true });
                  }
                }
              }
            });
            
            setShowCartValidationModal(false);
            
            if (itemsToPreOrder.length > 0) {
              toast.success(`${itemsToPreOrder.length} item${itemsToPreOrder.length > 1 ? 's' : ''} added as pre-order${itemsToPreOrder.length > 1 ? 's' : ''}`);
            }
          }}
          onCancel={() => {
            setShowCartValidationModal(false);
            // Navigate back to shopping
            navigate('/');
          }}
        />
      )}
    </div>
  );
}