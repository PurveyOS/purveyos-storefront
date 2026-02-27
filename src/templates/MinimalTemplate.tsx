import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { StorefrontTemplateProps } from '../types/storefront';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { WeightBinSelector } from '../components/WeightBinSelector';
import SubscriptionSelectorModal from '../components/SubscriptionSelectorModal';
import SubscriptionSubstitutionModal from '../components/SubscriptionSubstitutionModal';
import type { Product } from '../types/product';

export function MinimalTemplate({
  settings,
  products,
  categories,
  cart,
  tenantDefaultOrderMode,
  onAddToCart,
  onRemoveFromCart,
  onAddBinToCart,
  features,
}: StorefrontTemplateProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [subscriptionProduct, setSubscriptionProduct] = useState<Product | null>(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);
  const [substitutionItems, setSubstitutionItems] = useState<any[]>([]);
  const [pendingSubscriptionConfig, setPendingSubscriptionConfig] = useState<any | null>(null);
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});
  const [qtyInputs, setQtyInputs] = useState<Record<string, number>>({});
  const [activeBinProduct, setActiveBinProduct] = useState<Product | null>(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState<string | null>(null);

  const getEffectiveOrderMode = (product: Product) => {
    const hasBulkBin = (product.weightBins || []).some((b) => b.binKind === 'bulk_weight');
    return hasBulkBin ? 'pack_for_you' : (tenantDefaultOrderMode ?? 'exact_package');
  };

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

                    {/* Inventory Badge - Top Right */}
                    {(() => {
                      const isSoldOut = product.isSoldOut || !product.available || (product.inventory !== undefined && product.inventory <= 0);
                      const isWeight = product.unit?.toLowerCase()?.startsWith('lb');
                      
                      // For weight-based products with bins, calculate total available weight
                      if (isWeight && product.weightBins && !isSoldOut) {
                        const totalWeight = product.weightBins.reduce((sum, b) => {
                          if (b.binKind === 'bulk_weight') return sum;
                          return sum + ((b.weightBtn ?? 0) * (b.qty ?? 0));
                        }, 0);
                        const reservedWeight = product.weightBins.reduce((sum, b) => {
                          if (b.binKind === 'bulk_weight') return sum;
                          return sum + ((b.weightBtn ?? 0) * (b.reservedQty ?? 0));
                        }, 0);
                        const availableWeight = Math.max(0, totalWeight - reservedWeight - (product.reservedWeightLbs ?? 0));
                        
                        if (availableWeight > 0) {
                          const isLow = product.reminderThreshold && availableWeight <= product.reminderThreshold;
                          return (
                            <div className="absolute top-2 right-2">
                              <span className={`text-xs font-medium px-2 py-1 rounded-full ${isLow ? 'bg-orange-500 text-white' : 'bg-white/90 text-gray-800'} shadow-sm`}>
                                {availableWeight.toFixed(1)} lbs
                              </span>
                            </div>
                          );
                        }
                      }
                      
                      // For non-weight products, show inventory count
                      if (!isWeight && !isSoldOut && product.inventory !== undefined && product.inventory > 0) {
                        const isLow = product.reminderThreshold && product.inventory <= product.reminderThreshold;
                        return (
                          <div className="absolute top-2 right-2">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${isLow ? 'bg-orange-500 text-white' : 'bg-white/90 text-gray-800'} shadow-sm`}>
                              {product.inventory} left
                            </span>
                          </div>
                        );
                      }
                      
                      return null;
                    })()}

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-4 py-3 flex items-center justify-between">
                      <div className="text-left text-white">
                        <h3 className="font-semibold text-sm sm:text-base line-clamp-1">{product.name}</h3>
                        {product.variantSize && (
                          <div className="text-xs text-white/80">
                            {product.variantSize}{product.variantUnit ? ` ${product.variantUnit}` : ''}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs sm:text-sm text-white/90">
                          <span className="font-medium">${product.pricePer.toFixed(2)}</span>
                          {product.unit && <span>/ {product.unit}</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-4 pb-5 pt-3 space-y-3">
                    {product.description && (
                      <div className="flex items-start gap-2">
                        <p className="text-sm text-gray-600 line-clamp-2 flex-1">{product.description}</p>
                        <button
                          type="button"
                          onClick={() => setShowDescriptionModal(product.id)}
                          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-gray-700 hover:bg-gray-200 transition-colors"
                          title="View product details"
                        >
                          i
                        </button>
                      </div>
                    )}

                    {/* Deposit product badge */}
                    {product.is_deposit_product && (
                      <div className="flex items-center gap-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-300">
                          Deposit
                        </span>
                        <span className="relative group">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-xs font-bold cursor-default select-none">
                            ?
                          </span>
                          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-56 rounded-lg bg-gray-800 px-3 py-2 text-xs text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
                            This is a deposit product. You pay a deposit now — the final price is calculated after your hanging weight is received.
                            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                          </span>
                        </span>
                      </div>
                    )}

                    {/* Subscription CTA */}
                    {product.isSubscription && product.subscriptionData && (
                      <button
                        onClick={() => {
                          setSubscriptionProduct(product);
                          setShowSubscriptionModal(true);
                        }}
                        className="w-full border border-gray-900 text-gray-900 px-4 py-2 text-sm font-medium hover:bg-gray-900 hover:text-white transition-colors"
                      >
                        Add to Cart
                      </button>
                    )}

                    {/* Weight-based: bins or custom weight - Hide for subscriptions */}
                    {!product.isSubscription && (() => {
                      const effectiveOrderMode = getEffectiveOrderMode(product);
                      const isWeight = product.unit?.toLowerCase()?.startsWith('lb');
                      // Account for bins already in the cart when showing availability
                      const binCountsInCart = cart.items
                        .filter((item) => item.productId === product.id && item.binWeight != null)
                        .reduce<Record<number, number>>((acc, item) => {
                          const key = item.binWeight as number;
                          acc[key] = (acc[key] || 0) + item.quantity;
                          return acc;
                        }, {});

                      // For weight-based products, calculate total available weight using dual-check
                      let totalAvailableWeight = 0;
                      if (isWeight && product.weightBins) {
                        const totalWeight = product.weightBins.reduce((sum, b) => {
                          if (b.binKind === 'bulk_weight') return sum;
                          return sum + ((b.weightBtn ?? 0) * (b.qty ?? 0));
                        }, 0);
                        const reservedBinWeight = product.weightBins.reduce((sum, b) => {
                          if (b.binKind === 'bulk_weight') return sum;
                          return sum + ((b.weightBtn ?? 0) * (b.reservedQty ?? 0));
                        }, 0);
                        const reservedProductWeight = product.reservedWeightLbs ?? 0;
                        totalAvailableWeight = Math.max(0, totalWeight - reservedBinWeight - reservedProductWeight);
                      }

                      const adjustedBins = (product.weightBins || []).map((bin) => ({
                        ...bin,
                        qty: Math.max(0, (bin.qty ?? 0) - (bin.reservedQty ?? 0) - (binCountsInCart[bin.weightBtn ?? 0] || 0)),
                      }));

                      const legacyBins = adjustedBins.filter((bin) => bin.binKind !== 'bulk_weight');
                      const bulkBin = adjustedBins.find((bin) => bin.binKind === 'bulk_weight');
                      const bulkBinRaw = (product.weightBins || []).find((bin) => bin.binKind === 'bulk_weight');
                      const bulkPackageCount = bulkBinRaw ? (bulkBinRaw.qty ?? 0) : null;
                      const bulkAvgWeight = bulkBinRaw
                        ? ((bulkBinRaw.qty ?? 0) > 0
                          ? Math.max(0, (bulkBinRaw.qtyLbs ?? 0) - (bulkBinRaw.reservedLbs ?? 0)) / bulkBinRaw.qty
                          : 0)
                        : null;
                      const hasBins = legacyBins.length > 0;
                      // For weight items, check dual availability; for non-weight, use product.inventory
                      const effectiveInventory = (isWeight && product.weightBins) ? totalAvailableWeight : (product.inventory ?? 0);
                      const isSoldOut = product.isSoldOut || !product.available || effectiveInventory <= 0;
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
                        
                        // Check if exceeding available inventory for in-stock items
                        if (!canPreOrder && effectiveInventory > 0 && parsed > effectiveInventory) {
                          toast.error(`Only ${effectiveInventory.toFixed(1)} lbs available. ${product.allowPreOrder ? 'Try pre-ordering for more.' : ''}`);
                          return;
                        }
                        
                        // Set isPreOrder only when in pre-order mode
                        onAddToCart(product.id, 1, { weight: parsed, isPreOrder: canPreOrder });
                        setWeightInputs((prev) => ({ ...prev, [product.id]: '1' }));
                      };

                      const handlePackForYou = () => {
                        const parsed = parseInt(weightValue, 10);
                        if (!parsed || parsed <= 0) return;
                        
                        // Check bulk bin availability for pack-for-you
                        if (bulkBinRaw) {
                          const availableBulk = Math.max(0, (bulkBinRaw.qtyLbs ?? 0) - (bulkBinRaw.reservedLbs ?? 0));
                          if (parsed > availableBulk) {
                            toast.error(`Only ${availableBulk.toFixed(1)} lbs available in bulk.`);
                            return;
                          }
                        }
                        
                        onAddToCart(product.id, 1, {
                          requestedWeightLbs: parsed,
                          lineType: 'pack_for_you',
                        });
                        setWeightInputs((prev) => ({ ...prev, [product.id]: '1' }));
                      };

                      const handleFixedAdd = () => {
                        const qty = qtyValue > 0 ? qtyValue : 1;
                        const isSoldOut = product.isSoldOut || !product.available || (product.inventory !== undefined && product.inventory <= 0);
                        
                        if (isSoldOut && !canPreOrder) {
                          toast.error('This product is sold out');
                          return;
                        }
                        
                        if (product.inventory !== undefined && qty > product.inventory && !canPreOrder) {
                          toast.error(`Only ${product.inventory} available. ${product.allowPreOrder ? 'Try pre-ordering for more.' : ''}`);
                          return;
                        }
                        
                        // Set isPreOrder only when in pre-order mode
                        onAddToCart(product.id, qty, { isPreOrder: canPreOrder });
                        setQtyInputs((prev) => ({ ...prev, [product.id]: 1 }));
                      };

                      if (isWeight) {
                        return (
                          <div className="space-y-3">
                            {effectiveOrderMode === 'exact_package' && hasBins && (
                              <button
                                type="button"
                                onClick={() => setActiveBinProduct({ ...product, weightBins: adjustedBins })}
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
                            {effectiveOrderMode === 'exact_package' && canPreOrder && (
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
                            {effectiveOrderMode === 'pack_for_you' && (
                              <div className="space-y-2">
                                {bulkPackageCount !== null && bulkAvgWeight !== null && (
                                  <p className="text-xs text-gray-500">
                                    Packages: {bulkPackageCount} • Avg package: {bulkAvgWeight.toFixed(2)} lb
                                  </p>
                                )}
                                {legacyBins.length > 0 && (
                                  <p className="text-xs text-gray-500">
                                    Avg package: {(() => {
                                      const totalPackages = legacyBins.reduce(
                                        (sum, b) => sum + Math.max(0, (b.qty ?? 0) - (b.reservedQty ?? 0)),
                                        0
                                      );
                                      if (totalPackages <= 0) return '0.00';
                                      const totalWeight = legacyBins.reduce((sum, b) => {
                                        const available = Math.max(0, (b.qty ?? 0) - (b.reservedQty ?? 0));
                                        const weight = b.weightBtn ?? 0;
                                        return sum + (weight * available);
                                      }, 0);
                                      return (totalWeight / totalPackages).toFixed(2);
                                    })()} lb • {(() => {
                                      return legacyBins.reduce(
                                        (sum, b) => sum + Math.max(0, (b.qty ?? 0) - (b.reservedQty ?? 0)),
                                        0
                                      );
                                    })()} packages
                                  </p>
                                )}
                                <div className="flex items-center gap-3">
                                  <input
                                    type="number"
                                    step="1"
                                    min={Math.max(1, product.pack_for_you_min_lbs ?? 1)}
                                    value={weightValue}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/[^\d]/g, "");
                                      setWeightInputs((prev) => ({ ...prev, [product.id]: val }));
                                    }}
                                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    placeholder="lbs"
                                  />
                                  <button
                                    onClick={handlePackForYou}
                                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white transition-colors"
                                  >
                                    Add estimated weight
                                  </button>
                                </div>
                                <p className="text-xs text-gray-600">
                                  You’re ordering by estimated weight. Final total may vary based on actual package weights.
                                </p>
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
          minInterval={subscriptionProduct.subscriptionData.min_interval}
          durationType={subscriptionProduct.subscriptionData.duration_type}
          durationIntervals={subscriptionProduct.subscriptionData.duration_intervals}
          seasonStartDate={subscriptionProduct.subscriptionData.season_start_date}
          seasonEndDate={subscriptionProduct.subscriptionData.season_end_date}
          onConfirm={(config) => {
            const groups = subscriptionProduct.subscriptionData?.substitutionGroups?.filter(
              (g) => Array.isArray(g.options) && g.options.length > 0
            ) || [];

            if (groups.length > 0) {
              const items = groups.flatMap((g) =>
                g.options.map((opt) => ({
                  productId: opt.productId,
                  productName: opt.productName,
                  requiredQuantity: opt.requiredQuantity,
                  unit: opt.unit,
                  substitutionGroup: g.groupName,
                  groupUnitsAllowed: Number(g.allowedUnits ?? 1),
                }))
              );

              setSubstitutionItems(items);
              setPendingSubscriptionConfig({ config });
              setShowSubscriptionModal(false);
              setShowSubstitutionModal(true);
              return;
            }

            // Add subscription product with metadata
            onAddToCart(subscriptionProduct.id, 1, {
              metadata: {
                isSubscription: true,
                subscriptionProductId: subscriptionProduct.subscriptionData!.id,
                subscriptionInterval: config.interval,
                subscriptionDuration: config.duration,
                subscriptionDurationIntervals: config.durationIntervals,
                subscriptionTotalPrice: config.totalPrice,
                subscriptionName: subscriptionProduct.name,
              }
            });

            // Add each box content item as a separate line
            const boxContents = subscriptionProduct.subscriptionData?.boxContents || [];
            boxContents.forEach((item) => {
              onAddToCart(item.productId, item.quantity, {
                metadata: {
                  isPartOfSubscription: true,
                  parentSubscriptionId: subscriptionProduct.subscriptionData!.id,
                  parentSubscriptionName: subscriptionProduct.name,
                }
              });
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

      {/* Substitution Modal */}
      {showSubstitutionModal && subscriptionProduct && pendingSubscriptionConfig && (
        <SubscriptionSubstitutionModal
          subscriptionName={subscriptionProduct.name}
          items={substitutionItems}
          onConfirm={(selections) => {
            // Add subscription product with metadata
            onAddToCart(subscriptionProduct.id, 1, {
              metadata: {
                isSubscription: true,
                subscriptionProductId: subscriptionProduct.subscriptionData!.id,
                subscriptionInterval: pendingSubscriptionConfig.config.interval,
                subscriptionDuration: pendingSubscriptionConfig.config.duration,
                subscriptionDurationIntervals: pendingSubscriptionConfig.config.durationIntervals,
                subscriptionTotalPrice: pendingSubscriptionConfig.config.totalPrice,
                subscriptionName: subscriptionProduct.name,
                substitutionSelections: selections,
              }
            });

            // Add each box content item as a separate line
            const boxContents = subscriptionProduct.subscriptionData?.boxContents || [];
            boxContents.forEach((item) => {
              onAddToCart(item.productId, item.quantity, {
                metadata: {
                  isPartOfSubscription: true,
                  parentSubscriptionId: subscriptionProduct.subscriptionData!.id,
                  parentSubscriptionName: subscriptionProduct.name,
                }
              });
            });

            setShowSubstitutionModal(false);
            setSubscriptionProduct(null);
            setPendingSubscriptionConfig(null);
          }}
          onCancel={() => {
            setShowSubstitutionModal(false);
            setSubscriptionProduct(null);
            setPendingSubscriptionConfig(null);
          }}
        />
      )}

      {/* Weight Bin Modal */}
      {activeBinProduct && activeBinProduct.weightBins && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setActiveBinProduct(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-xl shadow-2xl p-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
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
              productId={activeBinProduct.id}
              cart={cart}
              onSelect={(bin) => {
                if (onAddBinToCart) {
                  onAddBinToCart(activeBinProduct.id, bin.weightBtn, bin.unitPriceCents);
                } else {
                  onAddToCart(activeBinProduct.id, 1, { binWeight: bin.weightBtn, unitPriceCents: bin.unitPriceCents });
                }
                // Keep modal open; user can add multiple packages and close manually
              }}
              primaryColor={settings.primaryColor}
            />
          </div>
        </div>
      )}

      {/* DESCRIPTION MODAL */}
      {showDescriptionModal && (() => {
        const product = filteredProducts.find(p => p.id === showDescriptionModal);
        return product ? (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowDescriptionModal(null)}
          >
            <div 
              className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900 flex-1 pr-4">
                  {product.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDescriptionModal(null)}
                  className="text-slate-500 hover:text-slate-700 text-xl font-bold flex-shrink-0"
                >
                  ✕
                </button>
              </div>
              <div className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                {product.description}
              </div>
            </div>
          </div>
        ) : null;
      })()}
    </div>
  );
}