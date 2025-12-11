import { useState } from 'react';
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

  const filteredProducts = selectedCategory 
    ? products.filter(product => product.categoryId === selectedCategory)
    : products;

  return (
    <div className="min-h-screen bg-white">
      <Navbar settings={settings} cart={cart} />
      
      {/* Minimal Hero */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
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
          <div className="flex justify-center flex-wrap gap-4">
            <button 
              onClick={() => setSelectedCategory(null)}
              className={`px-6 py-3 font-medium border-b-2 transition-colors ${
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
                className={`px-6 py-3 font-medium border-b-2 transition-colors ${
                  selectedCategory === category.id
                    ? 'border-gray-900'
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
                  <div className="aspect-w-4 aspect-h-3 mb-4 overflow-hidden">
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-64 object-cover"
                    />
                  </div>
                  <div className="px-4 pb-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="text-left">
                        <h3 className="font-semibold text-gray-900 text-lg mb-1">{product.name}</h3>
                        {product.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">{product.description}</p>
                        )}
                      </div>
                      {product.is_deposit_product && (
                        <div className="relative">
                          <button
                            type="button"
                            onMouseEnter={() => setDepositTooltip(product.id)}
                            onMouseLeave={() => setDepositTooltip(null)}
                            className="w-7 h-7 flex items-center justify-center rounded-full border text-xs text-gray-700 hover:bg-gray-100"
                            title="Deposit details"
                          >
                            i
                          </button>
                          {depositTooltip === product.id && (
                            <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs text-gray-700">
                              This is a deposit only. Total cost will be {product.deposit_prod_price_per_lb ? `$${product.deposit_prod_price_per_lb}/lb` : 'price per lb'} × hanging weight.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-gray-900">
                      <span className="text-xl font-light">${product.pricePer.toFixed(2)}</span>
                      {product.unit && <span className="text-sm text-gray-500">/ {product.unit}</span>}
                      {!product.available && <span className="text-xs text-red-500">Out of stock</span>}
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
                              <WeightBinSelector
                                bins={product.weightBins || []}
                                unit={product.unit}
                                onSelect={handleBinSelect}
                                primaryColor={settings.primaryColor}
                              />
                            )}
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
                                disabled={!product.available && !canPreOrder}
                                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                  product.available || canPreOrder
                                    ? 'border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'
                                    : 'border-gray-300 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                {canPreOrder && !product.available ? 'Pre-order weight' : 'Add weight'}
                              </button>
                            </div>
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
                            className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                          />
                          <button
                            onClick={handleFixedAdd}
                            disabled={!product.available}
                            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                              product.available
                                ? 'border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white'
                                : 'border-gray-300 text-gray-400 cursor-not-allowed'
                            }`}
                          >
                            Add to Cart
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
    </div>
  );
}