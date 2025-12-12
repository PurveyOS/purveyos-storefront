import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { StorefrontTemplateProps } from '../types/storefront';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { WeightBinSelector } from '../components/WeightBinSelector';
import SubscriptionSelectorModal from '../components/SubscriptionSelectorModal';
import type { Product } from '../types/product';

export function MinimalTemplate({
  settings,
  products,
  categories,
  cart,
  onAddToCart,
  onRemoveFromCart,
  onAddBinToCart,
  features,
}: StorefrontTemplateProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [subscriptionProduct, setSubscriptionProduct] = useState<Product | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});
  const [qtyInputs, setQtyInputs] = useState<Record<string, number>>({});
  const [depositTooltip, setDepositTooltip] = useState<string | null>(null);
  const depositButtonRefs = useRef<Record<string, HTMLElement | null>>({});
  const [activeBinProduct, setActiveBinProduct] = useState<Product | null>(null);

  const filteredProducts = selectedCategory 
    ? products.filter(product => product.categoryId === selectedCategory)
    : products;

  const cartItemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-white">
      <Navbar settings={settings} cart={cart} />
      
      {/* Sticky Floating Cart Button - Mobile Only */}
      <Link to="/cart" className="md:hidden fixed bottom-6 right-6 z-40">
        <button
          className="relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200"
          style={{ backgroundColor: settings.primaryColor }}
          aria-label="Open cart"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9"/>
          </svg>
          {cartItemCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[22px] h-[22px] rounded-full text-xs flex items-center justify-center text-black font-bold px-1"
              style={{ backgroundColor: settings.accentColor }}
            >
              {cartItemCount}
            </span>
          )}
        </button>
      </Link>
      
      {/* Minimal Hero with optional background image */}
      <section className="relative py-20 bg-gray-50 overflow-hidden">
        {/* Hero image with fade overlay for minimal feel */}
        {settings.heroImageUrl && (
          <>
            <div 
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${settings.heroImageUrl})` }}
            />
            {/* Subtle white fade overlay to keep minimal aesthetic */}
            <div className="absolute inset-0 bg-white/75" />
          </>
        )}
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl font-light text-gray-800 mb-4">
            {settings.farmName}
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            {settings.heroSubtitle}
          </p>
        </div>
      </section>

      {/* Simple Category Filter */}
      <section className="py-8 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center flex-wrap gap-2 sm:gap-3">
            <button 
              onClick={() => setSelectedCategory(null)}
              className={`px-3 sm:px-5 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                selectedCategory === null
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-600 hover:text-gray-800 border-transparent hover:border-gray-300'
              }`}
            >
              All Products
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-3 sm:px-5 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                  selectedCategory === category.id
                    ? 'text-gray-900 border-gray-900'
                    : 'text-gray-600 hover:text-gray-800 border-transparent hover:border-gray-300'
                }`}
                style={{ 
                  color: selectedCategory === category.id ? settings.primaryColor : undefined,
                  borderColor: selectedCategory === category.id ? settings.primaryColor : undefined
                }}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Clean Product Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {selectedCategory && (
            <div className="text-center mb-8">
              <h2 className="text-2xl font-light text-gray-800 mb-2">
                {categories.find(c => c.id === selectedCategory)?.name}
              </h2>
              <p className="text-gray-600">
                {categories.find(c => c.id === selectedCategory)?.description}
              </p>
            </div>
          )}
          
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="group border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="relative aspect-w-4 aspect-h-3 overflow-hidden">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-64 object-cover"
                    />

                    {/* Sold Out Overlay */}
                    {(() => {
                      const isSoldOut = product.isSoldOut || !product.available || (product.inventory !== undefined && product.inventory <= 0);
                      const canPreOrder = (features?.preOrdersEnabled !== false) && isSoldOut && product.allowPreOrder;
                      if (!isSoldOut) return null;
                      return (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                          <div className="relative">
                            <div className="border-2 border-black rounded-lg px-6 py-3 bg-white">
                              <span className="text-black text-lg font-light tracking-wide">SOLD OUT</span>
                            </div>
                            <div className="absolute inset-0 border-2 border-black rounded-lg" style={{ transform: 'rotate(-8deg)', zIndex: -1 }} />
                          </div>
                        </div>
                      );
                    })()}

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 py-3 flex items-center justify-between">
                      <div className="text-left text-white">
                        <h3 className="font-semibold text-sm sm:text-base line-clamp-1">{product.name}</h3>
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-white/90">
                          <span className="font-medium">${product.pricePer.toFixed(2)}</span>
                          {product.unit && <span>/ {product.unit}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pb-5 pt-3 space-y-3">
                    <div className="flex items-start justify-between">
                      {product.description && (
                        <p className="text-sm text-gray-600 line-clamp-2 flex-1">{product.description}</p>
                      )}
                      {product.is_deposit_product && (
                        <div className="relative ml-3">
                          <button
                            type="button"
                            ref={(el) => {
                              depositButtonRefs.current[product.id] = el;
                            }}
                            onMouseEnter={() => setDepositTooltip(product.id)}
                            onMouseLeave={() => setDepositTooltip(null)}
                            className="w-6 h-6 flex items-center justify-center rounded-full border text-[11px] text-gray-700 hover:bg-gray-100"
                            title="Deposit details"
                          >
                            i
                          </button>
                          {depositTooltip === product.id && depositButtonRefs.current[product.id] && (() => {
                            const rect = depositButtonRefs.current[product.id]!.getBoundingClientRect();
                            return (
                              <div 
                                className="fixed w-52 bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs text-gray-700 z-50"
                                style={{
                                  top: `${rect.bottom + 8}px`,
                                  left: `${rect.right + 8}px`
                                }}
                              >
                                This is a deposit only. Total cost will be {product.deposit_prod_price_per_lb ? `$${product.deposit_prod_price_per_lb}/lb` : 'price per lb'} × hanging weight.
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Subscription CTA */}
                    {product.isSubscription && product.subscriptionData && (
                      <button
                        onClick={() => {
                          setSubscriptionProduct(product);
                          setShowSubscriptionModal(true);
                        }}
                        className="w-full border border-gray-900 text-gray-900 px-4 py-2 text-sm font-medium hover:bg-gray-900 hover:text-white transition-colors"
                      >
                        Choose Subscription
                      </button>
                    )}

                    {/* Weight-based: bins or custom weight */}
                    {(() => {
                      const unit = (product.unit || '').toLowerCase();
                      const isWeight = product.pricingMode === 'weight' || unit === 'lb';
                      const hasBins = isWeight && product.weightBins && product.weightBins.length > 0;
                      const isSoldOut = product.isSoldOut || !product.available || (product.inventory !== undefined && product.inventory <= 0);
                      const canPreOrder = (features?.preOrdersEnabled !== false) && isSoldOut && product.allowPreOrder;

                      const weightValue = weightInputs[product.id] ?? '1';
                      const qtyValue = qtyInputs[product.id] ?? 1;

                      const handleBinSelect = (bin: { weightBtn: number; unitPriceCents: number }) => {
                        if (onAddBinToCart) {
                          onAddBinToCart(product.id, bin.weightBtn, bin.unitPriceCents);
                        } else {
                          onAddToCart(product.id, 1, { binWeight: bin.weightBtn, unitPriceCents: bin.unitPriceCents });
                        }
                      };

                      const handleCustomWeight = () => {
                        const parsed = parseFloat(weightValue);
                        if (!parsed || parsed <= 0) return;
                        onAddToCart(product.id, 1, { weight: parsed, isPreOrder: canPreOrder });
                        setWeightInputs((prev) => ({ ...prev, [product.id]: '1' }));
                      };

                      const handleFixedAdd = () => {
                        const qty = qtyValue > 0 ? qtyValue : 1;
                        onAddToCart(product.id, qty, { isPreOrder: canPreOrder });
                        setQtyInputs((prev) => ({ ...prev, [product.id]: 1 }));
                      };

                      if (isWeight) {
                        return (
                          <div className="space-y-3">
                            {hasBins && (
                              <button
                                type="button"
                                onClick={() => setActiveBinProduct(product)}
                                disabled={isSoldOut && !canPreOrder}
                                className={`w-full border px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                  isSoldOut && !canPreOrder
                                    ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                                    : 'border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'
                                }`}
                              >
                                {canPreOrder && isSoldOut ? 'Pre-order package' : 'Choose package'}
                              </button>
                            )}
                            {canPreOrder && (
                              <div className="flex items-center gap-3">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={weightValue}
                                  onChange={(e) => setWeightInputs((prev) => ({ ...prev, [product.id]: e.target.value }))}
                                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                  placeholder="lbs"
                                />
                                <button
                                  onClick={handleCustomWeight}
                                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white transition-colors"
                                >
                                  Pre-order weight
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            min="1"
                            value={qtyValue}
                            onChange={(e) => setQtyInputs((prev) => ({ ...prev, [product.id]: parseInt(e.target.value || '1', 10) }))}
                            onFocus={(e) => e.currentTarget.select()}
                            className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            disabled={isSoldOut && !canPreOrder}
                          />
                          <button
                            onClick={handleFixedAdd}
                            disabled={isSoldOut && !canPreOrder}
                            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                              isSoldOut && !canPreOrder
                                ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                                : 'border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'
                            }`}
                          >
                            {canPreOrder && isSoldOut ? 'Pre-order' : 'Add to Cart'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No products found in this category.</p>
            </div>
          )}
        </div>
      </section>

      <Footer settings={settings} />

      {/* Subscription Modal */}
      {showSubscriptionModal && subscriptionProduct?.subscriptionData && (
        <SubscriptionSelectorModal
          subscriptionName={subscriptionProduct.name}
          basePrice={subscriptionProduct.subscriptionData.price_per_interval}
          defaultInterval={subscriptionProduct.subscriptionData.interval_type}
          durationType={subscriptionProduct.subscriptionData.duration_type}
          seasonStartDate={subscriptionProduct.subscriptionData.season_start_date}
          seasonEndDate={subscriptionProduct.subscriptionData.season_end_date}
          onConfirm={(config) => {
            onAddToCart(subscriptionProduct.id, 1, {
              metadata: {
                isSubscription: true,
                subscriptionProductId: subscriptionProduct.subscriptionData!.id,
                subscriptionInterval: config.interval,
                subscriptionDuration: config.duration,
                subscriptionDurationIntervals: config.durationIntervals,
                subscriptionTotalPrice: config.totalPrice,
              }
            });
            setShowSubscriptionModal(false);
            setSubscriptionProduct(null);
          }}
          onCancel={() => {
            setShowSubscriptionModal(false);
            setSubscriptionProduct(null);
          }}
        />
      )}

      {/* Weight Bin Modal */}
      {activeBinProduct && activeBinProduct.weightBins && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-5 relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Choose package size</h3>
              <button
                onClick={() => setActiveBinProduct(null)}
                className="text-gray-500 hover:text-gray-800"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <WeightBinSelector
              bins={activeBinProduct.weightBins}
              unit={activeBinProduct.unit}
              onSelect={(bin) => {
                if (onAddBinToCart) {
                  onAddBinToCart(activeBinProduct.id, bin.weightBtn, bin.unitPriceCents);
                } else {
                  onAddToCart(activeBinProduct.id, 1, { binWeight: bin.weightBtn, unitPriceCents: bin.unitPriceCents });
                }
                setActiveBinProduct(null);
              }}
              primaryColor={settings.primaryColor}
            />
          </div>
        </div>
      )}
    </div>
  );
}