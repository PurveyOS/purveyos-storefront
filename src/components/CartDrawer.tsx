import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Cart } from '../types/storefront';
import type { Product } from '../types/product';

interface CartDrawerProps {
  cart: Cart;
  products: Product[];
  primaryColor?: string;
  accentColor?: string;
}

export function CartDrawer({ cart, products, primaryColor = '#0f6fff', accentColor = '#ffcc00' }: CartDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const hasPreOrders = cart.items.some((item) => (item as any).isPreOrder);

  // Show floating button even if cart empty so users know where the cart lives

  return (
    <>
      {/* Floating Cart Button (Mobile only) */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 md:hidden flex items-center gap-2 px-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
        style={{ backgroundColor: accentColor }}
        aria-label="Open cart"
      >
        <svg className="w-5 h-5 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9"/>
        </svg>
        <span className="text-sm font-bold text-slate-900">{cartCount}</span>
      </button>

      {/* Bottom Drawer (Mobile) */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/40 z-50 md:hidden"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Drawer */}
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 max-h-[80vh] flex flex-col md:hidden animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1 bg-slate-300 rounded-full"></div>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                Your Cart ({cartCount} {cartCount === 1 ? 'item' : 'items'})
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-full transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {cart.items.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Your cart is empty</p>
              ) : (
                <div className="space-y-3">
                  {cart.items.slice(0, 5).map((item, idx) => {
                    const product = products.find(p => p.id === item.productId);
                    const itemPrice = (() => {
  if (!product) return 0;

  // Pre-packaged bin item
  if (item.binWeight && item.unitPriceCents) {
    const unitPrice = item.unitPriceCents / 100;
    const isEach = (item.product?.unit || '').toLowerCase() === 'ea' || Boolean((item.product as any)?.variantSize || (item.product as any)?.variantUnit);
    return (isEach ? unitPrice : (item.binWeight * unitPrice)) * item.quantity;
  }

  // Pack-for-you estimated weight
  if (item.lineType === 'pack_for_you' && item.requestedWeightLbs && product.pricingMode === "weight") {
    const unitPrice = product.pricePer; // dollars per lb
    return unitPrice * item.requestedWeightLbs * item.quantity;
  }

  // Weight-based (pre-order or in-stock by weight)
  if (item.weight && product.pricingMode === "weight") {
    const unitPrice = product.pricePer; // dollars per lb
    return unitPrice * item.weight * item.quantity;
  }

  // Fixed-price (ea)
  return product.pricePer * item.quantity;
})();

                    
                    return (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {product?.name || `Product ${item.productId}`}
                          </p>
                          <p className="text-xs text-slate-500">
                            Qty: {item.quantity}
                            {item.weight && ` (${item.weight} lbs)`}
                            {item.lineType === 'pack_for_you' && item.requestedWeightLbs && ` (${item.requestedWeightLbs} lbs requested)`}
                            {item.binWeight && ((item.product?.unit || '').toLowerCase() === 'ea' || Boolean((item.product as any)?.variantSize || (item.product as any)?.variantUnit)
                              ? ` (${item.binWeight} ${(item.product as any)?.variantUnit || 'ea'})`
                              : ` (${item.binWeight} lb pkg)`)}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">
                          ${itemPrice.toFixed(2)}
                        </p>
                      </div>
                    );
                  })}
                  {cart.items.length > 5 && (
                    <p className="text-xs text-center text-slate-500">
                      +{cart.items.length - 5} more items
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 p-5 space-y-3">
              
                 {hasPreOrders && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Some items are <span className="font-semibold">pre-orders</span> and may
                not be ready on your pickup date. We’ll confirm availability before pickup.
                 </p>
                   )}
                   <div className="flex items-center justify-between">
                <span className="text-base font-medium text-slate-700">Total</span>
                <span className="text-xl font-bold" style={{ color: primaryColor }}>
                  ${cart.total.toFixed(2)}
                </span>
              </div>
              <Link
                to="/cart"
                onClick={() => setIsOpen(false)}
                className="block w-full py-3 text-center text-white font-semibold rounded-full shadow-md hover:shadow-lg transition-all duration-200"
                style={{ backgroundColor: primaryColor }}
              >
                View Cart & Checkout
              </Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
