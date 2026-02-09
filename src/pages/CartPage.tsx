import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { useStorefrontData } from '../hooks/useStorefrontData';
import { useTenantFromDomain } from '../hooks/useTenantFromDomain';
import { formatRestockDate } from '../utils/inventory';
import { trackBeginCheckout, trackEvent } from '../utils/analytics';

export function CartPage() {
  const { tenant } = useTenantFromDomain();
  const { data: storefrontData } = useStorefrontData(tenant?.id || '');
  const { cart, addToCart, removeFromCart, clearCart } = useCart();

  useEffect(() => {
    if (!tenant?.id) return;
    trackEvent('view_cart', { tenantId: tenant.id, itemsCount: cart.items.length, value: cart.total });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant?.id]);

  const primaryColor = storefrontData?.settings.primaryColor || '#0f6fff';

  if (!storefrontData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div 
          className="animate-spin rounded-full h-12 w-12 border-b-2"
          style={{ borderColor: primaryColor }}
        ></div>
      </div>
    );
  }

  const cartItems = cart.items.map((item: any) => {
    const product = storefrontData.products.find(p => p.id === item.productId);

    // Fallback: allow subscription lines even if base product is filtered out/not online
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

    if (!product) {
      return null;
    }

    return { ...item, product };
  }).filter(Boolean);

  const isEmpty = cartItems.length === 0;

  // Calculate actual cart total based on items
  const cartTotal = cartItems.reduce((sum, item) => {
    if (!item?.product) return sum;
    
    const { product, quantity } = item as any;
    const binWeight: number | undefined = (item as any).binWeight;
    const unitPriceCents: number | undefined = (item as any).unitPriceCents;
    const weight: number | undefined = (item as any).weight;
    const requestedWeightLbs: number | undefined = (item as any).requestedWeightLbs;
    const lineType: string | undefined = (item as any).lineType;
    const metaPrice: number | undefined = (item as any).metadata?.subscriptionTotalPrice;
    
    let lineUnitPrice: number;
    
    if (binWeight && unitPriceCents) {
      // Pre-packaged bin (lb or EA variant)
      const isEach = (product.unit || '').toLowerCase() === 'ea' || Boolean((product as any).variantSize || (product as any).variantUnit);
      lineUnitPrice = isEach ? (unitPriceCents / 100) : (binWeight * (unitPriceCents / 100));
    } else if (lineType === 'pack_for_you' && requestedWeightLbs && requestedWeightLbs > 0) {
      // Pack-for-you estimated weight
      lineUnitPrice = product.pricePer * requestedWeightLbs;
    } else if (weight && weight > 0) {
      // Weight-based pricing
      lineUnitPrice = product.pricePer * weight;
    } else if (metaPrice && metaPrice > 0) {
      // Subscription line with explicit total price
      lineUnitPrice = metaPrice;
    } else {
      // Fixed pricing
      lineUnitPrice = product.pricePer;
    }
    
    return sum + (lineUnitPrice * quantity);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Shopping Cart</h1>
            <Link
              to="/"
              className="inline-flex items-center px-4 py-2 text-white rounded-lg transition-all duration-200 hover:opacity-90 hover:shadow-lg"
              style={{ backgroundColor: primaryColor }}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m0 7h18"/>
              </svg>
              Continue Shopping
            </Link>
          </div>
          
          {isEmpty ? (
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9"/>
                </svg>
                <h3 className="mt-4 text-lg font-medium text-gray-900">Your cart is empty</h3>
                <p className="mt-2 text-gray-500">Start adding some delicious products to your cart!</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Cart Items */}
              <div className="bg-white rounded-lg shadow-md overflow-hidden">
                {cartItems.map((item) => {
                  if (!item?.product) return null;
                  
                  const { product, quantity } = item as any;
                  const binWeight: number | undefined = (item as any).binWeight;
                  const unitPriceCents: number | undefined = (item as any).unitPriceCents;
                  const weight: number | undefined = (item as any).weight;
                  const requestedWeightLbs: number | undefined = (item as any).requestedWeightLbs;
                  const lineType: string | undefined = (item as any).lineType;
                  const metaPrice: number | undefined = (item as any).metadata?.subscriptionTotalPrice;
                  const isPreOrder: boolean = (item as any).isPreOrder || false;
                  
                  // Calculate line item price based on pricing mode
                  let lineUnitPrice: number;
                  let displayInfo: string;
                  
                  if (binWeight && unitPriceCents) {
                    // Pre-packaged bin (lb or EA variant)
                    const isEach = (product.unit || '').toLowerCase() === 'ea' || Boolean((product as any).variantSize || (product as any).variantUnit);
                    const sizeUnit = (product as any).variantUnit || product.unit;
                    lineUnitPrice = isEach ? (unitPriceCents / 100) : (binWeight * (unitPriceCents / 100));
                    displayInfo = isEach
                      ? `${binWeight} ${sizeUnit} @ $${(unitPriceCents / 100).toFixed(2)}`
                      : `${binWeight} ${product.unit} package`;
                  } else if (lineType === 'pack_for_you' && requestedWeightLbs && requestedWeightLbs > 0) {
                    // Pack-for-you estimated weight
                    lineUnitPrice = product.pricePer * requestedWeightLbs;
                    displayInfo = `${requestedWeightLbs} ${product.unit} requested @ $${product.pricePer.toFixed(2)}/${product.unit}`;
                  } else if (weight && weight > 0) {
                    // Weight-based pricing (check weight first, don't rely on pricingMode)
                    lineUnitPrice = product.pricePer * weight;
                    displayInfo = `${weight} ${product.unit} @ $${product.pricePer.toFixed(2)}/${product.unit}`;
                  } else if (metaPrice && metaPrice > 0) {
                    // Subscription line with explicit total price
                    lineUnitPrice = metaPrice;
                    displayInfo = `${product.name} (${(product as any).subscriptionInterval || 'subscription'})`;
                  } else {
                    // Fixed pricing
                    lineUnitPrice = product.pricePer;
                    displayInfo = `$${product.pricePer.toFixed(2)} / ${product.unit}`;
                  }
                  
                  const itemTotal = lineUnitPrice * quantity;
                  
                  return (
                    <div key={`${product.id}-${binWeight ?? weight ?? requestedWeightLbs ?? lineType ?? 'standard'}`} className="flex items-start p-4 border-b border-gray-200 last:border-b-0 gap-3">
                      <div className="relative flex-shrink-0">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                        {isPreOrder && (
                          <span className="absolute top-1 right-1 px-2 py-1 bg-blue-500 text-white text-xs font-bold rounded-md">
                            Pre-order
                          </span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-gray-900 leading-tight">{product.name}</h3>
                            <p className="text-sm text-gray-600 mt-1">{product.description}</p>
                            <div className="text-sm text-gray-600 mt-1">
                              <div>{displayInfo}</div>
                              {quantity > 1 && (
                                <div className="text-gray-500">${lineUnitPrice.toFixed(2)} × {quantity}</div>
                              )}
                              {isPreOrder && product.restockDate && (
                                <div className="text-blue-600 text-xs mt-1">
                                  Expected: {formatRestockDate(product.restockDate)}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Quantity controls and price - top right on mobile */}
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => removeFromCart(product.id, { binWeight, weight, requestedWeightLbs, lineType: lineType as any })}
                                className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4"/>
                                </svg>
                              </button>
                              
                              <span className="w-6 text-center font-medium text-sm">{quantity}</span>
                              
                              <button
                                onClick={() => addToCart(product.id, 1, { binWeight, unitPriceCents, weight, requestedWeightLbs, lineType })}
                                className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
                                </svg>
                              </button>
                            </div>
                            
                            <div className="text-base font-semibold whitespace-nowrap" style={{ color: primaryColor }}>
                              ${itemTotal.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Cart Summary */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg font-medium">Total:</span>
                  <span 
                    className="text-2xl font-bold"
                    style={{ color: primaryColor }}
                  >${cartTotal.toFixed(2)}</span>
                </div>
                
                <div className="flex space-x-4">
                  <button
                    onClick={clearCart}
                    className="flex-1 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Clear Cart
                  </button>
                  
                  <Link
                    to="/checkout"
                    onClick={() => trackBeginCheckout({ tenantId: tenant?.id, itemsCount: cart.items.length, value: cartTotal, currency: 'USD' })}
                    className="flex-1 px-4 py-2 text-white rounded-lg transition-all duration-200 hover:opacity-90 hover:shadow-lg text-center font-medium"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Proceed to Checkout
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}